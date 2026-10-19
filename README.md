# ShowTime

App personale per tenere traccia di film e serie TV visti: database titoli (TMDB), statistiche all-time
(totale / film / serie), watchlist, import da Trakt, installabile sul telefono.

**Stack:** React + Vite (interfaccia) · Cloudflare Pages Functions (API) · Cloudflare D1 (database) ·
login integrato (nome utente + password) · TMDB (dati dei titoli).

---

## Setup (una tantum)

I nomi dei menu di Cloudflare possono cambiare leggermente nel tempo, ma i passaggi restano questi.

### 1. GitHub
Crea un repository (anche privato) chiamato `showtime` e carica tutto il contenuto di questa cartella
(`node_modules` e `dist` non servono).

### 2. Database D1
1. Cloudflare Dashboard → **Storage & databases → D1 SQL database → Create database** → nome `showtime-db`.
2. Apri il database → scheda **Console** → incolla tutto il contenuto di `schema.sql` → **Execute**.

### 3. Progetto Pages
1. **Workers & Pages → Create → Pages → Connect to Git** → scegli il repo `showtime`.
2. Build command: `npm run build` · Build output directory: `dist` · Deploy.

### 4. Collegamenti e variabili
Nel progetto Pages → **Settings**:
- **Bindings → Add → D1 database**: Variable name `DB`, database `showtime-db`.
- **Variables and Secrets** (Production, tipo *Secret*): `TMDB_TOKEN` = il tuo **API Read Access Token** di TMDB
  (account TMDB → Impostazioni → API; è il token lungo, non la "API Key" corta).

Poi **Deployments → Retry deployment** (o fai un nuovo commit) perché le modifiche abbiano effetto.

### 5. Login (nome utente e password)
Aggiungi altre due variabili nel progetto Pages (**Settings → Variables and Secrets**, Production, tipo *Secret*):

- `AUTH_SECRET` = una stringa lunga e casuale (almeno 40 caratteri: usa il generatore del gestore password
  oppure digita a caso). Serve a firmare le sessioni; non te la chiederà mai nessuno.
- `APP_USERS` = `nome:password`, per esempio `stefano:una-password-lunga-e-solo-tua`.

Poi rifai il deploy (**Retry deployment**). Alla prima apertura l'app mostra la schermata di login; la sessione
si rinnova da sola a ogni utilizzo e scade solo dopo 365 giorni senza aprire l'app.

Scegli una password lunga (14+ caratteri, meglio una frase): non c'è la verifica in due passaggi. Senza queste
variabili l'API risponde "Login non configurato": è voluto, così i dati non restano mai esposti.

### 6. Sul telefono
Apri l'indirizzo, fai il login con nome utente e password, poi:
- **iPhone**: Condividi → *Aggiungi alla schermata Home*
- **Android**: menu del browser → *Installa app*

In **Impostazioni → Importa dati** carica lo ZIP di Trakt (l'import si può ripetere senza creare doppioni).

---

## Condividere l'app con amici
Aggiungi un utente in `APP_USERS` separandolo con il punto e virgola:
`stefano:password1;anna:password2`. Poi rifai il deploy. Ognuno vede solo i propri dati (il database separa
tutto per nome utente), mentre la cache dei titoli TMDB è condivisa. Per togliere l'accesso a qualcuno basta
cancellare la sua coppia: la sessione smette di funzionare subito.

## Backup
- **Impostazioni → Scarica backup (JSON)**: file completo delle tue visioni, watchlist e stati. Si ripristina
  da **Importa dati**.
- D1 offre anche il ripristino a un momento passato (*Time Travel*): controlla nella documentazione Cloudflare
  la durata prevista dal tuo piano.

## TMDB
L'app usa le API di TMDB. Per rispettare le loro linee guida, scarica il logo dalla pagina brand di TMDB,
salvalo come `public/tmdb.svg` e comparirà in Impostazioni.

## Note tecniche
- Le serie vengono tracciate episodio per episodio. Data e voto sono facoltativi (vuoti di default).
- Ogni visione è una riga: più visioni dello stesso film = rivisioni.
- Lo stato di una serie, se non lo scegli tu, è calcolato: *Completata* quando hai visto tutti gli episodi usciti.
- Gli speciali (stagione 0) contano nelle ore e negli episodi visti, ma non nel progresso della serie.
- Cambiando lingua (Italiano/English) i titoli vengono riscaricati in background nella nuova lingua.
