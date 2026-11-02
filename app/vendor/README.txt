Vendored Bibliotheken
=====================

Fremdbibliotheken liegen als fertige Datei hier und werden in index.html direkt
eingebunden — kein CDN, kein Build-Schritt, kein npm im Frontend.

jspdf.inline.js
    jsPDF 2.5.1 (MIT), übernommen aus der ImkereiApp. Erzeugt die PDF-Anleitungen.
    Zugriff über window.jspdf.jsPDF.

    Die Standardschrift Helvetica kann nur WinAnsi: Umlaute, ß, „ “, –, •, × gehen,
    ≈ → − ✓ dagegen nicht. MW.pdf.text() ersetzt diese Zeichen vor der Ausgabe.

    Beim Testen: jsPDF legt seine Methoden als EIGENE Eigenschaften der Instanz an,
    nicht am Prototyp. Ein Patch an jsPDF.API zerstört die Klasse für die Sitzung.
