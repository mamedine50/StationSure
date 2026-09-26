# Décision à prendre — Vérification du PIN hors ligne (phase 6)

Statut : **options documentées, rien d'implémenté**. La phase 2 vérifie le PIN en ligne
(`verify_employee_pin`, SECURITY DEFINER, hash bcrypt jamais transmis à l'appareil).

## Contrainte

Une station a une connexion instable (architecture v2, §2). L'employé doit pouvoir ouvrir un shift
et saisir des relevés sans réseau, donc s'identifier sans réseau. Mais :

- le hash du PIN ne doit jamais être lisible par l'API (décision phase 1 : table `employee_pins` sans
  policy) ;
- un PIN à 4 chiffres a 10 000 combinaisons : tout hash présent sur l'appareil se casse en secondes
  si l'appareil est compromis ;
- toute opération doit rester attribuée à une personne, un appareil et une heure, et être acceptée
  par la base à la synchronisation (policy `employee_id = current_employee_id()`).

## Ce qui est déjà prévu pour l'extension

- `verify_employee_pin` renvoie un objet `{ ok, error, … }` sans exception : un client peut le
  rejouer à la reconnexion.
- `employee_sessions.id` est un uuid fournissable par le client : une session ouverte hors ligne
  peut être rejouée avec le même identifiant (idempotence).
- `pin_attempts` et `alerts.pin_lockout` sont côté serveur : le blocage reste centralisé.

## Options

### A. Sessions longues + pré-autorisation en ligne (recommandée pour le pilote)

L'employé s'identifie en ligne au moins une fois par jour (ouverture du shift). La session de 12 h
est stockée chiffrée sur l'appareil. Hors ligne, l'app ne redemande pas le PIN pour les opérations
de la session en cours ; le retour à l'écran PIN après inactivité ne fait que verrouiller l'écran et
le déverrouillage compare un **jeton de session** (pas le PIN) tant que la session n'est pas expirée.

- Sécurité : aucun secret dérivé du PIN sur l'appareil. Le PIN n'est jamais vérifiable hors ligne.
- Limite : impossible de changer d'employé hors ligne. Une panne réseau au moment de la passation
  bloque la passation (règle « pas de preuve, pas de clôture » assumée).
- Effort : faible. Compatible tel quel avec la phase 2.

### B. Vérificateur local dérivé (PBKDF2/Argon2 + sel + secret appareil)

À chaque connexion en ligne, le serveur renvoie pour chaque employé de la station un vérificateur
`H = Argon2id(PIN, sel_employé, secret_appareil)` où `secret_appareil` est généré par le serveur
pour cet appareil et stocké dans le Keystore Android (SecureStore). Hors ligne, l'app recalcule `H`
et ouvre une session locale en attente ; à la reconnexion, elle appelle `verify_employee_pin` avec
un mode « rejeu » (nouvelle RPC `replay_offline_session(session_id, employee_id, started_at,
preuve)`), qui accepte ou refuse et attribue les opérations.

- Sécurité : le vérificateur ne sert que sur cet appareil (lié au secret matériel) ; bruteforce
  possible uniquement après extraction du Keystore. Coût Argon2 à régler pour ralentir 10 000 essais.
- Limite : blocage après 5 échecs à gérer localement puis réconcilié ; le serveur peut refuser a
  posteriori une session (employé désactivé entre-temps) : les opérations restent stockées mais
  marquées « attribution refusée » et alertent le propriétaire.
- Effort : moyen. Nécessite une table `offline_verifiers` ou un endpoint dédié, un secret par
  appareil, une politique de rotation.

### C. PIN stocké chiffré sur l'appareil (à exclure)

Chiffrer les PIN (ou hashs bcrypt) avec une clé du Keystore et vérifier localement. Simple, mais un
appareil rooté expose tous les PIN de la station : incompatible avec l'objectif anti-fraude.

### D. Second facteur matériel (badge NFC / QR personnel)

Chaque employé a un badge ; hors ligne, badge + PIN. Le badge porte un secret vérifiable localement
sans exposer le PIN. Coût matériel et logistique ; envisageable pour un groupe de stations, pas pour
le pilote.

## Recommandation

Phase 6 : commencer par **A** (aucun changement de modèle de sécurité), mesurer sur le pilote la
fréquence réelle des passations hors ligne, puis décider **B** si elle est significative. **C** est
exclu. **D** reste une piste pour la V2 (multi-stations).

## Points à valider avec le propriétaire du produit

1. Une passation sans réseau doit-elle être possible (donc B) ou peut-elle attendre le réseau (A) ?
2. Durée maximale d'une session hors ligne avant blocage (proposition : 12 h, comme en ligne).
3. Que faire d'une opération dont l'attribution est refusée au rejeu : conserver + alerte (proposé)
   ou rejeter.
