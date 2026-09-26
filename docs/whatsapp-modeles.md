# Modèles WhatsApp et mise en service (phase 5)

En phase 5, **aucun message réel n'est envoyé** : l'adaptateur `DevNotifier` marque les messages
délivrés et la page locale `/dev/messages` les affiche. Ce document donne le texte exact des modèles
à soumettre à Meta et la procédure pour activer l'envoi réel (`MetaWhatsAppNotifier`).

## 1. Pourquoi des modèles

Sur la WhatsApp Business Platform (Cloud API), un message envoyé à l'initiative de l'entreprise en
dehors d'une conversation ouverte depuis moins de 24 h **doit** être un modèle approuvé par Meta.
Les rapports du soir, alertes et relances sont donc des modèles (catégorie **Utility**), en
français (`fr`). Règles Meta à respecter :

- un paramètre `{{n}}` ne peut contenir ni retour à la ligne, ni tabulation, ni plus de 4 espaces
  consécutifs : chaque ligne du message correspond à un paramètre ;
- le corps fait au plus 1 024 caractères et ne commence ni ne finit par un paramètre (d'où la
  signature « — StationSûre » en dernière ligne) ;
- les émojis sont autorisés dans le texte fixe.

Le texte fixe et l'ordre des variables ci-dessous sont **exactement** ceux que produit
`supabase/functions/notify-worker/notifiers/meta.ts` (`parametresModele`) à partir du corps rendu
par la base (`render_evening_report`, `render_summary_report`, `render_alert_message`,
`remind_manager`), lui-même identique à `renderRapportSoir` / `renderResumeJournee` /
`renderAlerteCourte` de `packages/core/src/notifications.ts`.

## 2. Les quatre modèles

### `stationsure_rapport_soir` — rapport du soir (écran 06)

Corps :

```
Station {{1}} · Clôture du {{2}}
Chiffre d'affaires : {{3}} FCFA
{{4}}
Litres : {{5}}
{{6}}
{{7}}
{{8}}
{{9}}
{{10}}
{{11}}
Détail : {{12}}
— StationSûre
```

| Variable | Contenu                                                                                   | Exemple                                                                     |
| -------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `{{1}}`  | nom de la station                                                                         | `Mbour`                                                                     |
| `{{2}}`  | date de clôture (JJ/MM, fuseau Africa/Dakar)                                              | `24/09`                                                                     |
| `{{3}}`  | chiffre d'affaires figé, format sénégalais                                                | `2 385 000`                                                                 |
| `{{4}}`  | répartition par activité                                                                  | `Carburant 2 190 000 · Boutique 145 000 · Garage 0 · Lavage 50 000`         |
| `{{5}}`  | litres par produit                                                                        | `Super 1 067 · Gasoil 1 500`                                                |
| `{{6}}`  | ligne caisse : ✅ aucun écart / toléré, ⚠️ écart avec le nom du gérant                     | `⚠️ Écart caisse Shift soir : −35 000 FCFA (gérant : Ibrahima Sarr)`        |
| `{{7}}`  | ligne passation                                                                           | `✅ Passations OK` ou `⚠️ Passation : 10,00 L à justifier (P3-A)`            |
| `{{8}}`  | ligne bordereau de versement                                                              | `⚠️ Bordereau de versement : manquant`                                      |
| `{{9}}`  | ligne Wave / Orange Money et statut de rapprochement                                      | `✅ Wave / Orange Money : 1 050 000 FCFA, rapproché`                         |
| `{{10}}` | ligne cuves (écart et seuil effectif)                                                     | `✅ Cuves : −0,2 % (seuil 0,5 %)`                                            |
| `{{11}}` | ligne photos d'index (faites / attendues)                                                 | `✅ Photos d'index : 12/12`                                                  |
| `{{12}}` | lien vers le détail web du shift                                                          | `https://app.exemple.sn/caisse/…`                                           |

Exemple de message envoyé (test `120_proprietaire` et `notifications.test.ts`) :

```
Station Mbour · Clôture du 24/09
Chiffre d'affaires : 2 385 000 FCFA
Carburant 2 190 000 · Boutique 145 000 · Garage 0 · Lavage 50 000
Litres : Super 1 067 · Gasoil 1 500
⚠️ Écart caisse Shift soir (démo) : −35 000 FCFA (gérant : Ibrahima Sarr)
✅ Passations OK
⚠️ Bordereau de versement : manquant
⚠️ Wave / Orange Money : 1 050 000 FCFA, en attente de rapprochement
✅ Cuves : pas de jaugeage rapproché
✅ Photos d'index : 13/13
Détail : http://localhost:3000/caisse/…
```

### `stationsure_resume_journee` — résumé multi-stations (organisations à plusieurs stations)

```
Résumé du {{1}} · {{2}} clôture(s) sur {{3}} station(s)
Stations : {{4}}
{{5}}
— StationSûre
```

| Variable | Contenu                                                | Exemple                                                                     |
| -------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `{{1}}`  | date                                                   | `25/09`                                                                     |
| `{{2}}`  | nombre de clôtures                                     | `3`                                                                         |
| `{{3}}`  | nombre de stations actives                             | `3`                                                                         |
| `{{4}}`  | une entrée par station, séparées par « · »             | `Kaolack : 3 443 000 FCFA · caisse OK · Mbour : 4 812 500 FCFA · écart −35 000` |
| `{{5}}`  | total et alertes graves                                | `Total : 12 460 500 FCFA · alertes graves : 1`                              |

Envoyé après la dernière clôture de la journée (mode « après chaque clôture ») ou à l'heure fixe.

### `stationsure_alerte` — alerte immédiate

```
⚠️ {{1}}
Détail : {{2}}
— StationSûre
```

| Variable | Contenu                                                    | Exemple                                                     |
| -------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| `{{1}}`  | station · quoi (avec montant) · qui                        | `Mbour · Écart de caisse −35 000 FCFA · Ibrahima Sarr`      |
| `{{2}}`  | lien vers la page Alertes                                  | `https://app.exemple.sn/alertes?id=…`                       |

Types immédiats par défaut : écart de passation, écart de caisse, livraison avec réserve, index qui
recule, PIN bloqué (modifiable dans Paramètres › Quand prévenir). Anti-spam : une alerte identique
(même station, même type) pour un même destinataire dans une tranche de 10 minutes est regroupée
dans le premier message (`variables.count`).

### `stationsure_relance_bordereau` — relance du gérant (écran 17)

```
{{1}}
— StationSûre
```

| Variable | Contenu                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------- |
| `{{1}}`  | `Bonjour Fatou Faye, le bordereau de versement du 24/09 (Thiès, espèces comptées 940 000 FCFA) est attendu. Merci de le photographier dans StationSûre.` |

Envoyée au **gérant** (numéro sur la fiche employé), une fois par heure au plus par shift.

## 3. Procédure de mise en service (à faire par le propriétaire du compte)

1. **Compte Meta Business** : sur <https://business.facebook.com>, créer (ou utiliser) un portefeuille
   d'entreprise vérifié (documents de l'entreprise : registre de commerce, NINEA…). La vérification
   prend de quelques heures à quelques jours.
2. **Application Meta** : sur <https://developers.facebook.com> › Mes applications › Créer une
   application › type « Entreprise », ajouter le produit **WhatsApp**. Relier le portefeuille.
3. **Numéro d'envoi** : dans WhatsApp › Configuration de l'API, ajouter un numéro (un numéro sénégalais
   dédié, **non** utilisé par l'application WhatsApp classique), vérifier par SMS. Noter :
   - l'**identifiant du numéro** (`Phone number ID`) → `META_PHONE_NUMBER_ID` ;
   - l'**identifiant du compte WhatsApp Business** (WABA ID), utile pour les modèles.
4. **Jeton d'accès permanent** : Business Manager › Paramètres › Utilisateurs système › créer un
   utilisateur système « stationsure-notify », l'affecter à l'application avec l'autorisation
   `whatsapp_business_messaging` et `whatsapp_business_management`, générer un jeton **sans
   expiration** → `META_WHATSAPP_TOKEN`. Ne jamais le versionner.
5. **Modèles** : WhatsApp Manager › Outils de compte › Modèles de message › Créer : catégorie
   **Utility**, langue **Français**, nom exact (`stationsure_rapport_soir`, `stationsure_resume_journee`,
   `stationsure_alerte`, `stationsure_relance_bordereau`), corps copié depuis la section 2, un
   exemple de valeur par variable (repris des tableaux). Attendre le statut **Approuvé** (souvent
   quelques minutes, jusqu'à 24 h). Un modèle refusé doit être corrigé puis resoumis ; le nom doit
   rester identique à celui utilisé par la base (colonne `template` de `notification_outbox`).
6. **Webhook de statut** : Application › WhatsApp › Configuration › Webhooks : URL de rappel
   `https://<projet>.supabase.co/functions/v1/notify-webhook`, jeton de vérification = la valeur
   choisie pour `META_WEBHOOK_VERIFY_TOKEN` ; s'abonner au champ `messages`. Le secret de
   l'application (Paramètres › Général › Clé secrète) → `META_APP_SECRET` (vérification de la
   signature `X-Hub-Signature-256`).
7. **Variables des Edge Functions** (jamais dans le repo) : `supabase secrets set NOTIFIER=meta
   META_WHATSAPP_TOKEN=… META_PHONE_NUMBER_ID=… META_APP_SECRET=… META_WEBHOOK_VERIFY_TOKEN=…
   NOTIFY_WORKER_SECRET=<aléatoire long> SITE_URL=https://app…` puis déployer
   `notify-worker`, `notify-webhook`, `invite-supervisor` (`supabase functions deploy`, par le
   propriétaire du repo, jamais par un agent).
8. **pg_cron en ligne** : mettre à jour `private.notify_config` (URL publique du worker
   `https://<projet>.supabase.co/functions/v1/notify-worker`, même `worker_secret` que
   `NOTIFY_WORKER_SECRET`, `apikey` = clé publishable du projet).
9. **Destinataires** : Paramètres › WhatsApp · destinataires : chaque numéro en E.164
   (`+221 77 …`). Le destinataire doit avoir WhatsApp ; le premier message est un modèle, donc
   aucune action préalable n'est requise de sa part.
10. **Test** : Paramètres › bandeau « WhatsApp en mode test » disparaît quand `NOTIFIER=meta` ; faire une
    clôture de test et vérifier dans WhatsApp puis dans `notification_outbox_events` le passage
    `queued → sent → delivered`.

Coûts : Meta facture par conversation « utility » (tarif Sénégal, voir la grille Meta) ; un rapport
du soir + quelques alertes par jour et par destinataire restent très en dessous d'un abonnement SMS.

## 4. SMS de secours

Option « SMS de secours si WhatsApp n'est pas délivré en 10 min » (Paramètres) : si un message
WhatsApp reste `sent` sans `delivered` après le délai, `escalate_undelivered()` crée une copie sur
le canal `sms` (même corps, sans mise en forme). `SmsNotifier` est une passerelle HTTP générique
(POST JSON `{to, from, text}`, jeton Bearer) à adapter au fournisseur retenu (Orange SMS API Sénégal,
Twilio, InfoBip…) : seule `construireRequeteSms` change. Variables : `SMS_API_URL`, `SMS_API_TOKEN`,
`SMS_SENDER`. Non activé en phase 5.
