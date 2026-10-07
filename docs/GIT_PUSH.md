# Push GitHub da questa checkout

Questa checkout usa il branch `main` e il remote `origin` del repository DOGly.

Prima del push:

```powershell
git status --short
git log -1 --oneline
git remote -v
```

Il push del commit già verificato si esegue senza cambiare la storia:

```powershell
git push origin main
```

In questa sessione il comando deve essere eseguito con accesso di rete autorizzato quando la sandbox blocca la connessione HTTPS. Il metodo che ha funzionato è stato ripetere lo stesso comando con l’autorizzazione di rete, senza cambiare remote, token o commit.

Dopo il push controllare l’esito riportato da Git e verificare che il branch remoto avanzi dal precedente SHA al nuovo SHA:

```powershell
git status --short
git log -1 --oneline
```

Non usare `--force`, `rebase`, `reset` o `amend` per risolvere un errore di autenticazione o di rete. Non stampare, copiare o salvare token nel repository. Se il push fallisce, riportare il comando e l’errore esatto e lasciare invariato il commit locale.
