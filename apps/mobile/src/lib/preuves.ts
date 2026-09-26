import type { ValeurEnum } from '@stationsure/database';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { AppState } from 'react-native';

import { supabase } from './supabase';

export type KindPreuve = ValeurEnum<'evidence_kind'>;

export interface Gps {
  lat: number;
  lng: number;
}

/** Position au moment de la photo (null si refus ou indisponible en 6 s). */
export async function positionActuelle(): Promise<Gps | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((r) => setTimeout(() => r(null), 6000)),
    ]);
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

/** Compression ≈ 1280 px, JPEG 70 %, puis sha256 du fichier compressé (calculé sur le téléphone). */
export async function compresserEtHacher(
  uri: string,
): Promise<{ uri: string; sha256: string; base64: string }> {
  const ctx = ImageManipulator.ImageManipulator.manipulate(uri).resize({ width: 1280 });
  const image = await ctx.renderAsync();
  const resultat = await image.saveAsync({
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  const base64 =
    resultat.base64 ?? (await FileSystem.readAsStringAsync(resultat.uri, { encoding: 'base64' }));
  const sha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return { uri: resultat.uri, sha256, base64 };
}

function base64VersOctets(base64: string): Uint8Array {
  const binaire = globalThis.atob(base64);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
}

// ---------------------------------------------------------------------------
// File d'attente d'envoi : une preuve est créée en base immédiatement, le fichier
// part dès que possible ; l'opération reste « en attente de preuve » d'ici là.
// ---------------------------------------------------------------------------
interface ElementFile {
  evidenceId: string;
  storagePath: string;
  localUri: string;
  tentatives: number;
}

const FICHIER_FILE = `${FileSystem.documentDirectory ?? ''}file-preuves.json`;
let file: ElementFile[] = [];
let charge = false;
let enCours = false;
const abonnes = new Set<() => void>();
const envoyees = new Set<string>();

async function chargerFile(): Promise<void> {
  if (charge) return;
  charge = true;
  try {
    const info = await FileSystem.getInfoAsync(FICHIER_FILE);
    if (info.exists)
      file = JSON.parse(await FileSystem.readAsStringAsync(FICHIER_FILE)) as ElementFile[];
  } catch {
    file = [];
  }
}

async function sauverFile(): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(FICHIER_FILE, JSON.stringify(file));
  } catch {
    // le stockage local peut être indisponible : la file reste en mémoire
  }
  for (const f of abonnes) f();
}

export function abonnerFile(f: () => void): () => void {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

export function nombreEnAttente(): number {
  return file.length;
}

export function preuveEnAttente(evidenceId: string): boolean {
  return file.some((e) => e.evidenceId === evidenceId);
}

export function preuveEnvoyee(evidenceId: string): boolean {
  return envoyees.has(evidenceId);
}

/** Envoie les preuves en attente, une par une. Les échecs restent dans la file. */
export async function traiterFile(): Promise<void> {
  if (enCours) return;
  enCours = true;
  await chargerFile();
  try {
    for (const element of [...file]) {
      try {
        const base64 = await FileSystem.readAsStringAsync(element.localUri, { encoding: 'base64' });
        const { error } = await supabase.storage
          .from('evidence')
          .upload(element.storagePath, base64VersOctets(base64), {
            contentType: 'image/jpeg',
            upsert: false,
          });
        if (error && !/already exists|duplicate/i.test(error.message)) throw error;
        const { data, error: erreurConfirmation } = await supabase.rpc('confirm_evidence_upload', {
          p_evidence_id: element.evidenceId,
        });
        if (erreurConfirmation || !(data as { ok?: boolean })?.ok) throw new Error('confirmation');
        envoyees.add(element.evidenceId);
        file = file.filter((e) => e.evidenceId !== element.evidenceId);
        await sauverFile();
      } catch {
        element.tentatives += 1;
        await sauverFile();
      }
    }
  } finally {
    enCours = false;
  }
}

// Relance automatique : toutes les 15 s tant qu'il reste des preuves, et au retour au premier plan.
setInterval(() => {
  if (file.length > 0) void traiterFile();
}, 15000);
AppState.addEventListener('change', (etat) => {
  if (etat === 'active') void traiterFile();
});

export interface NouvellePreuve {
  kind: KindPreuve;
  uri: string;
  capturedAt: Date;
  gps: Gps | null;
}

/**
 * Crée la ligne evidence_files (chemin imposé {org}/{station}/{id}.jpg, sha256 du fichier)
 * puis met le fichier en file d'envoi. Renvoie l'id de la preuve.
 */
export async function creerPreuve(
  p: NouvellePreuve,
  ctx: { organizationId: string; stationId: string; deviceId: string; employeeId: string },
): Promise<string> {
  await chargerFile();
  const { uri, sha256 } = await compresserEtHacher(p.uri);
  const id = Crypto.randomUUID();
  const storagePath = `${ctx.organizationId}/${ctx.stationId}/${id}.jpg`;
  const { error } = await supabase.from('evidence_files').insert({
    id,
    organization_id: ctx.organizationId,
    station_id: ctx.stationId,
    device_id: ctx.deviceId,
    employee_id: ctx.employeeId,
    kind: p.kind,
    storage_path: storagePath,
    sha256,
    captured_at_device: p.capturedAt.toISOString(),
    gps_lat: p.gps?.lat ?? null,
    gps_lng: p.gps?.lng ?? null,
    device_created_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  file.push({ evidenceId: id, storagePath, localUri: uri, tentatives: 0 });
  await sauverFile();
  void traiterFile();
  return id;
}
