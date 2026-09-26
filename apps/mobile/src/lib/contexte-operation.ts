import type { EtatSession } from './session';

/** Identifiants nécessaires pour créer une preuve ou une opération depuis l'appareil. */
export function contexteOperation(session: EtatSession) {
  if (session.etat !== 'connecte') return null;
  return {
    organizationId: session.appareil.organizationId,
    stationId: session.appareil.stationId,
    deviceId: session.appareil.deviceId,
    employeeId: session.employe.employeeId,
    employeeName: session.employe.fullName,
    role: session.employe.role,
    stationName: session.appareil.stationName,
  };
}
export type ContexteOperation = NonNullable<ReturnType<typeof contexteOperation>>;
