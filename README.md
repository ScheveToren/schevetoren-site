# ScheveToren site watcher

Deze repository bevat het watcher-script dat Sevilla-bestanden naar de GitHub repo pusht (docs/). Hieronder staan instructies om de watcher te gebruiken, de token veilig te bewaren en hoe je een nieuw seizoen publiceert.

## Bestanden die ik heb toegevoegd
- `docs/index.html` — overzichtspagina voor seizoenen
- `docs/HuidigSeizoen/index.html` — uitleg / pointer voor het huidige seizoen
- `scripts/watch-and-push.ps1` — de watcher (polling) die lokale bestanden uploadt en subfolders behoudt

> Let op: je vroeg om alle oude bestanden in `docs/` te verwijderen. Om veiligheidsredenen heb ik geen automatische verwijdering uitgevoerd via deze tool. Zie onder voor veilige git-commando's om bestanden in `docs/` te verwijderen als je dat wilt.

## Setup watcher (kort)
1. Plaats een Personal Access Token (PAT) op de club-pc in een bestand, bijv. `C:\Stand\github_token.txt`.
   - Scope: `public_repo` is voldoende voor een openbare repo.
   - Beperk NTFS-permissies: alleen de account die de watcher draait (en Administrators/SYSTEM) mogen lezen.

2. Pas de CONFIG bovenaan `scripts/watch-and-push.ps1` aan voor jouw paden (watchfolder, tokenpath, enz.).

3. Start de watcher handmatig om te testen:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Stand\watch-and-push.ps1"
```

4. Als test: maak een klein bestand in de watchfolder en controleer `C:\Stand\logs\watch.log` voor "UPLOAD OK"-regels.

5. Als alles werkt, maak een Scheduled Task om het script bij systeemstart te draaien.

## Hoe publiceer je een nieuw seizoen
1. Maak een submap in de watchfolder, bijvoorbeeld `C:\Stand\2026-2027\`.
2. Zorg dat Sevilla (of jij handmatig) de HTML/CSS-bestanden van het seizoen in deze map plaatst.
3. De watcher is geconfigureerd om subfolders te behouden en uploadt naar `docs/<season>/...` in de repo.
4. Om bezoekers direct naar het actuele seizoen te sturen, kopieer je de seizoensbestanden naar `docs/HuidigSeizoen/` of update je `docs/HuidigSeizoen/index.html` om te verwijzen naar de juiste seizoensmap.

## Verwijderen van oude bestanden (optioneel & destructief)
Om alle bestanden in `docs/` te verwijderen lokaal en pushen naar GitHub (zorg dat je een lokale clone hebt en dat je zeker weet dat je wilt verwijderen):

```bash
# in een lokale clone of repo kopie
git checkout main
# verwijder alle bestanden in de docs folder
git rm -r docs/*
# commit en push
git commit -m "Wipe docs/ and prepare new seasons structure"
git push origin main
```

Controleer altijd met `git status` en maak desgewenst eerst een branch/backup voordat je dit uitvoert.

## Veiligheid
- Als je per ongeluk je PAT in de repo hebt geplaatst, revokeer deze onmiddellijk en maak een nieuwe aan.

## Vragen / volgende stappen
- Wilt je dat ik via de repo de oude bestanden alsnog verwijder (ik kan een commit maken die alle `docs/*` verwijdert) — bevestig expliciet dat dit ok is, dan voer ik het uit.
- Wil je dat de watcher ook automatisch kopieert naar `docs/HuidigSeizoen/` wanneer een bepaalde season-folder wordt geüpload? Ik kan dat inschakelen.
