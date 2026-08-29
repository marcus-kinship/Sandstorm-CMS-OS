Option Explicit

Dim fso, rootPath, results
Dim totalJS,    totalCSS,    totalHTML,    totalAll
Dim totalJSnd,  totalCSSnd,  totalHTMLnd,  totalAllNd
Dim countJS, countCSS, countHTML

Set fso = CreateObject("Scripting.FileSystemObject")
rootPath = fso.GetParentFolderName(WScript.ScriptFullName)

totalJS    = 0 : totalJSnd    = 0 : countJS   = 0
totalCSS   = 0 : totalCSSnd   = 0 : countCSS  = 0
totalHTML  = 0 : totalHTMLnd  = 0 : countHTML  = 0
totalAll   = 0 : totalAllNd   = 0

results = ""

' Count lines without /** ... */ JSDoc blocks
Function CountNoDoc(content)
    Dim lns, k, inDoc, nd, trimmed
    lns = Split(content, vbLf)
    inDoc = False
    nd = 0
    For k = 0 To UBound(lns)
        trimmed = Trim(lns(k))
        If Not inDoc Then
            If Left(trimmed, 3) = "/**" Then
                inDoc = True
                ' skip this line
            Else
                nd = nd + 1
            End If
        Else
            If InStr(trimmed, "*/") > 0 Then
                inDoc = False
                ' skip closing line
            End If
            ' skip all lines inside block
        End If
    Next
    CountNoDoc = nd
End Function

Sub ScanFolder(folder)
    Dim f, sub_
    For Each f In folder.Files
        Dim ext : ext = LCase(fso.GetExtensionName(f.Name))
        If ext = "js" Or ext = "css" Or ext = "html" Then
            Dim ts : Set ts = fso.OpenTextFile(f.Path, 1)
            Dim lines : lines = 0
            Dim linesNd : linesNd = 0
            If Not ts.AtEndOfStream Then
                Dim content : content = ts.ReadAll
                lines   = UBound(Split(content, vbLf)) + 1
                linesNd = CountNoDoc(content)
            End If
            ts.Close

            Dim relPath : relPath = Mid(f.Path, Len(rootPath) + 2)
            results = results & ext & Chr(9) & lines & Chr(9) & linesNd & Chr(9) & relPath & vbCrLf

            If ext = "js"   Then totalJS    = totalJS    + lines : totalJSnd    = totalJSnd    + linesNd : countJS   = countJS   + 1
            If ext = "css"  Then totalCSS   = totalCSS   + lines : totalCSSnd   = totalCSSnd   + linesNd : countCSS  = countCSS  + 1
            If ext = "html" Then totalHTML  = totalHTML  + lines : totalHTMLnd  = totalHTMLnd  + linesNd : countHTML  = countHTML  + 1
            totalAll   = totalAll   + lines
            totalAllNd = totalAllNd + linesNd
        End If
    Next
    For Each sub_ In folder.SubFolders
        ScanFolder sub_
    Next
End Sub

ScanFolder fso.GetFolder(rootPath)

' Sort by ext then total lines descending (bubble sort)
Dim rows : rows = Split(Left(results, Len(results)-2), vbCrLf)
Dim i, j, tmp
For i = 0 To UBound(rows) - 1
    For j = 0 To UBound(rows) - 1 - i
        Dim a : a = Split(rows(j),   Chr(9))
        Dim b : b = Split(rows(j+1), Chr(9))
        Dim sortA : sortA = a(0) & String(10 - Len(a(1)), "0") & a(1)
        Dim sortB : sortB = b(0) & String(10 - Len(b(1)), "0") & b(1)
        If sortA < sortB Then
            tmp = rows(j) : rows(j) = rows(j+1) : rows(j+1) = tmp
        End If
    Next
Next

' Build output
Dim out
out = "===== Sandstorm OS CMS - Radrakning =====" & vbCrLf
out = out & String(70, "-") & vbCrLf
out = out & "Typ" & Chr(9) & "Totalt" & Chr(9) & "Utan doc" & Chr(9) & "Fil" & vbCrLf
out = out & String(70, "-") & vbCrLf

For i = 0 To UBound(rows)
    If rows(i) <> "" Then
        Dim parts : parts = Split(rows(i), Chr(9))
        out = out & UCase(parts(0)) & Chr(9) & parts(1) & Chr(9) & parts(2) & Chr(9) & parts(3) & vbCrLf
    End If
Next

out = out & String(70, "-") & vbCrLf
out = out & "JS   " & Chr(9) & totalJS    & Chr(9) & totalJSnd    & Chr(9) & "(" & countJS   & " filer)" & vbCrLf
out = out & "CSS  " & Chr(9) & totalCSS   & Chr(9) & totalCSSnd   & Chr(9) & "(" & countCSS  & " filer)" & vbCrLf
out = out & "HTML " & Chr(9) & totalHTML  & Chr(9) & totalHTMLnd  & Chr(9) & "(" & countHTML  & " filer)" & vbCrLf
out = out & String(70, "-") & vbCrLf
out = out & "TOTALT" & Chr(9) & totalAll & Chr(9) & totalAllNd & Chr(9) & "(" & (countJS + countCSS + countHTML) & " filer)" & vbCrLf
out = out & "Doc-rader borttagna: " & (totalAll - totalAllNd) & vbCrLf

' Write result file
Dim outFile : outFile = rootPath & "\line_count_result.txt"
Dim ots : Set ots = fso.CreateTextFile(outFile, True)
ots.Write out
ots.Close

MsgBox out, 64, "Radrakning klar"
WScript.Echo "Resultat sparat i: " & outFile
