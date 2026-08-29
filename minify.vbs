Option Explicit

' ============================================================================
' minify.vbs
'
' Minifies every .js/.css file under this project into a mirrored dist\
' folder (same relative paths as the source), so nothing about the app's
' loading architecture has to change - every app.includeModule()/import()/
' app.importFile() call still resolves the exact same relative path, just
' potentially pointed at dist\ later if the user chooses to. Never merges
' files or changes load order, so this is safe by construction (unlike
' combine.vbs's concatenation, which has real constraints - see that file).
'
' Every other file (index.html, images, wallpaper, fonts, and already-
' minified third-party libraries like jquery-3.7.1.min.js - reprocessing
' those wastes time and risks mangling code these simple regexes weren't
' tuned against) is copied into dist\ unmodified at the same relative path.
' This makes dist\ a complete, directly runnable copy of the project (e.g.
' `python -m http.server` from inside dist\), not just a size comparison.
'
' Excluded entirely (not copied, not processed): anything already under
' dist\, .claude\, or .git\ (avoid reprocessing output / unrelated tooling).
'
' What "minify" means here (NOT a real parser, but not just naive regexes
' either - documented limitations, not hidden):
'   1. Strip /* ... */ block comments (whole file, global pass).
'   2. Strip // comments - both whole-line AND trailing-after-code (e.g.
'      `taskbar: true, // Show in taskbar` becomes `taskbar: true,`) - AND
'      collapse any run of 2+ spaces/tabs mid-line down to exactly one space
'      (never to zero - see CanJoin's comment for why removing a separator
'      entirely is dangerous, same reasoning applies here to e.g. `a - -b`).
'      Both done by one character-by-character scanner (CleanCodeLine) that
'      tracks single-/double-quote strings, backtick template literals, AND
'      regex literals (including "[...]" character classes, so e.g.
'      /[A-Za-z0-9+/]/ isn't mistaken for a comment mid-regex) - whitespace
'      and "//" sequences INSIDE any of those are left completely untouched,
'      only ones genuinely in plain code get touched.
'   3. Drop blank lines (including lines that become blank once their
'      trailing comment is removed).
'   4. Trim leading/trailing whitespace per remaining line.
'   5. Drop line breaks where CanJoin() can prove it's safe (JS's automatic
'      semicolon insertion means "no line break" and "line break" are NOT
'      always equivalent - see that function's own comment for the exact
'      rule and the real breakage in sandstorm/components/load.js it was
'      written to fix). CSS has no such hazard and always joins fully.
'      Result: most line breaks are gone, but not literally all of them in
'      JS files - the ones left are the ones that aren't provably safe to
'      remove without a real parser, not an oversight.
'   6. CSS gets the same whitespace-collapsing (CleanCssLine) - no // step
'      (standard CSS has no line comments) and no regex-literal concern, but
'      it does protect quoted strings AND unquoted url(...) values (real in
'      this project - res/icons/sandstorm.css's `url(fa-solid-900.woff2)`)
'      from being touched, same principle as CleanCodeLine.
' Still no token-level minification (renaming variables, removing whitespace
' that's actually required as a token separator) - that needs a real parser.
' Typical result: comments, indentation, and redundant whitespace gone,
' most line breaks gone, not Terser-level output but a real, safe reduction.
'
' No external dependencies. Run via double-click (wscript.exe) or
' `cscript minify.vbs` from a terminal.
' ============================================================================

Dim fso, rootPath, distPath
Set fso = CreateObject("Scripting.FileSystemObject")
rootPath = fso.GetParentFolderName(WScript.ScriptFullName)
distPath = rootPath & "\dist"
If Not fso.FolderExists(distPath) Then fso.CreateFolder distPath

' ---- UTF-8 aware file I/O (see combine.vbs for why this is needed instead
' of plain FileSystemObject.OpenTextFile) ----

Function ReadUtf8(filePath)
    Dim s
    Set s = CreateObject("ADODB.Stream")
    s.Type = 2 ' adTypeText
    s.Charset = "utf-8"
    s.Open
    s.LoadFromFile filePath
    ReadUtf8 = s.ReadText
    s.Close
End Function

Sub WriteUtf8NoBom(filePath, text)
    Dim s, bin, bytes
    Set s = CreateObject("ADODB.Stream")
    s.Type = 2
    s.Charset = "utf-8"
    s.Open
    s.WriteText text
    s.Position = 0
    s.Type = 1 ' adTypeBinary
    s.Position = 3 ' skip the UTF-8 BOM ADODB always writes for Charset="utf-8"
    Set bin = CreateObject("ADODB.Stream")
    bin.Type = 1
    bin.Open
    If s.Position < s.Size Then
        bytes = s.Read(-1) ' adReadAll (remaining bytes)
        bin.Write bytes
    End If
    s.Close
    If fso.FileExists(filePath) Then fso.DeleteFile filePath, True
    bin.SaveToFile filePath, 2 ' adSaveCreateOverWrite
    bin.Close
End Sub

' ---- Minification ----

Dim reBlockComment
Set reBlockComment = New RegExp
reBlockComment.Pattern = "/\*[\s\S]*?\*/"
reBlockComment.Global = True
reBlockComment.MultiLine = True
' Known limitation shared with the line-comment scanner below: this is a
' single global regex pass over the raw text, with no string-literal
' awareness - a JS/CSS string that contains the literal text "/* ... */"
' would be wrongly treated as a real comment. Not observed anywhere in this
' codebase's actual style (comments-as-text-inside-strings essentially never
' happens here), so left as the simple, already-verified-safe global pass
' rather than folded into the character-scanner below (block comments can
' span multiple lines, which a per-line scanner can't handle without
' carrying state across lines).

' A "/" only starts a regex literal (not division) when the previous
' significant character is one JS would also treat that way - i.e. an
' operator/punctuator/keyword-ish context, not a value. This is the same
' cheap heuristic real lightweight JS lexers use (full correctness needs a
' real parser, which is out of scope here, same as everywhere else in this
' script).
Function IsRegexAllowed(prevChar)
    If prevChar = "" Then
        IsRegexAllowed = True
    Else
        IsRegexAllowed = (InStr("([{,;:=!&|?+-*%^~<>", prevChar) > 0)
    End If
End Function

' Scans one line of JS character-by-character, tracking single/double-quote
' strings, backtick template literals, and regex literals (including "[...]"
' character classes, where "/" doesn't need escaping - e.g. /[A-Za-z0-9+/]/
' is a single regex, not two things split by a comment), and does two things
' with that tracking in one pass:
'   1. Cuts off a trailing "//" comment the moment one is found OUTSIDE all
'      of those (same rule as before - only a real comment gets cut).
'   2. Collapses any run of 2+ spaces/tabs into a single space, but ONLY
'      when that whitespace is outside a string/template/regex - whitespace
'      INSIDE one of those is part of the actual value (e.g. `"a  b"` must
'      stay `"a  b"`, not become `"a b"`) and is copied through untouched.
' Deliberately does NOT remove whitespace down to zero anywhere (e.g. would
' never turn `a - -b` into `a--b`, or `a + b` into `a+b`) - collapsing a run
' down to exactly one space is always safe (a token separator is still
' there), while removing it entirely can silently merge two tokens into a
' different one (two identifiers into a single longer identifier, two "-"
' into a "--" decrement operator, "/" + "/" into a comment-start, etc.) -
' that's real-tokenizer territory this script isn't attempting.
Function CleanCodeLine(line)
    Dim i, ch, nextCh, ln, state, prevSig, outLn, lastWasSpace
    ln = Len(line)
    state = "" ' "", "'", quote, backtick, "regex", "class"
    prevSig = ""
    outLn = ""
    lastWasSpace = False
    i = 1
    Do While i <= ln
        ch = Mid(line, i, 1)
        Select Case state
            Case "'", Chr(34), "`"
                outLn = outLn & ch
                If ch = "\" Then
                    i = i + 1
                    If i <= ln Then outLn = outLn & Mid(line, i, 1)
                ElseIf ch = state Then
                    state = ""
                End If
            Case "regex"
                outLn = outLn & ch
                If ch = "\" Then
                    i = i + 1
                    If i <= ln Then outLn = outLn & Mid(line, i, 1)
                ElseIf ch = "[" Then
                    state = "class"
                ElseIf ch = "/" Then
                    state = ""
                End If
            Case "class"
                outLn = outLn & ch
                If ch = "\" Then
                    i = i + 1
                    If i <= ln Then outLn = outLn & Mid(line, i, 1)
                ElseIf ch = "]" Then
                    state = "regex"
                End If
            Case Else ' plain code
                If ch = "'" Or ch = Chr(34) Or ch = "`" Then
                    state = ch
                    outLn = outLn & ch
                    prevSig = ch
                    lastWasSpace = False
                ElseIf ch = "/" Then
                    nextCh = Mid(line, i + 1, 1)
                    If nextCh = "/" Then
                        CleanCodeLine = outLn ' real trailing comment - stop here
                        Exit Function
                    ElseIf nextCh = "*" Then
                        ' Defensive only - block comments are already gone via
                        ' the earlier global pass; a literal "/*" surviving to
                        ' here is unexpected, so just pass it through as-is
                        ' rather than guessing.
                        outLn = outLn & ch & nextCh
                        i = i + 1
                        prevSig = "*"
                        lastWasSpace = False
                    ElseIf IsRegexAllowed(prevSig) Then
                        state = "regex"
                        outLn = outLn & ch
                        prevSig = "/"
                        lastWasSpace = False
                    Else
                        outLn = outLn & ch
                        prevSig = "/" ' division operator
                        lastWasSpace = False
                    End If
                ElseIf ch = " " Or ch = vbTab Then
                    If Not lastWasSpace And outLn <> "" Then
                        outLn = outLn & " "
                        lastWasSpace = True
                    End If
                    ' else: redundant whitespace - collapsed away
                Else
                    outLn = outLn & ch
                    prevSig = ch
                    lastWasSpace = False
                End If
        End Select
        i = i + 1
    Loop
    CleanCodeLine = outLn
End Function

' CSS's equivalent of CleanCodeLine - much simpler since CSS has no ASI, no
' regex literals, and only one kind of line comment issue (none - standard
' CSS doesn't have "//" comments at all). Still needs to protect two things
' from whitespace collapsing: quoted strings ('...'/"...") same as JS, and
' url(...) - CSS explicitly allows an UNQUOTED value inside url(), which is
' real in this project (`src: url(fa-solid-900.woff2) format("woff2");` in
' res/icons/sandstorm.css) - so "url(" through its matching ")" is treated
' as opaque, exactly like a string, even without quotes.
'
' Whitespace immediately before/after "{" "}" ";" or "," is removed
' ENTIRELY (not just collapsed to one space) - unlike CleanCodeLine's rule
' for JS, this is safe in CSS because none of those four characters can
' combine with an adjacent token to form something else (no CSS equivalent
' of JS's "a - -b" hazard here - "margin:0}" and "}.bar{" are exactly what
' real minified CSS looks like). Deliberately NOT extended to ":" even
' though real minifiers often also strip space after it in declarations -
' a space before ":" is genuinely meaningful in a SELECTOR context
' (`a:hover` = element a while hovered, vs `a :hover` = descendant of a
' that's hovered - two different selectors), and telling "inside a
' declaration block" from "inside a selector" apart needs brace-depth
' tracking this function doesn't do. Left alone rather than guessing.
Function CleanCssLine(line)
    Dim i, ch, ln, state, outLn, lastWasSpace, peek, eatSpaceAfter
    ln = Len(line)
    state = "" ' "", "'", quote, "url"
    outLn = ""
    lastWasSpace = False
    eatSpaceAfter = False
    i = 1
    Do While i <= ln
        ch = Mid(line, i, 1)
        Select Case state
            Case "'", Chr(34)
                outLn = outLn & ch
                If ch = "\" Then
                    i = i + 1
                    If i <= ln Then outLn = outLn & Mid(line, i, 1)
                ElseIf ch = state Then
                    state = ""
                End If
            Case "url"
                outLn = outLn & ch
                If ch = ")" Then state = ""
            Case Else ' plain CSS
                If ch = "'" Or ch = Chr(34) Then
                    state = ch
                    outLn = outLn & ch
                    lastWasSpace = False
                    eatSpaceAfter = False
                ElseIf ch = " " Or ch = vbTab Then
                    If eatSpaceAfter Then
                        ' right after "{" "}" ";" "," - drop entirely, no
                        ' separator needed there at all
                    ElseIf Not lastWasSpace And outLn <> "" Then
                        outLn = outLn & " "
                        lastWasSpace = True
                    End If
                ElseIf ch = "{" Or ch = "}" Or ch = ";" Or ch = "," Then
                    If lastWasSpace Then outLn = Left(outLn, Len(outLn) - 1) ' drop the space before it too
                    outLn = outLn & ch
                    lastWasSpace = False
                    eatSpaceAfter = True
                Else
                    outLn = outLn & ch
                    lastWasSpace = False
                    eatSpaceAfter = False
                    If ch = "(" And Len(outLn) >= 4 Then
                        If LCase(Right(outLn, 4)) = "url(" Then
                            peek = Mid(line, i + 1, 1)
                            ' A quoted url("...") is already handled by the
                            ' normal string-tracking above once that quote is
                            ' reached - only go opaque here for the unquoted case.
                            If peek <> "'" And peek <> Chr(34) Then state = "url"
                        End If
                    End If
                End If
        End Select
        i = i + 1
    Loop
    CleanCssLine = outLn
End Function

' A bare `return`/`break`/`continue`/`throw` with nothing else on its line is
' the one common real-world case where deleting the line break changes
' behavior: JS's automatic semicolon insertion (ASI) terminates the
' statement right there specifically because of that line break, so
' `return\nfoo()` means "return (nothing); foo();", not "return foo();" -
' joining those two lines with a plain space would silently change what the
' code does. Keeping the newline after a bare line like that (instead of a
' space) preserves the original meaning exactly. (Checked: this codebase
' has zero such lines today, but the guard costs nothing and documents the
' one real trap here rather than silently assuming it can't happen.)
Function IsBareAsiKeyword(s)
    IsBareAsiKeyword = (s = "return" Or s = "break" Or s = "continue" Or s = "throw")
End Function

' Whether it's safe to delete the line break between two already-cleaned JS
' lines and join them with a single space instead. This is deliberately
' conservative - NOT joining is always safe (that's just the original code),
' so only join when it's provably fine per real JS grammar/ASI rules:
'   - the previous line ends with "{" "(" "[" "," or ";" - each of those
'     syntactically requires something to follow, so there's no statement
'     boundary there for ASI to have been protecting.
'   - OR the next line starts with "}" ")" "]" "," or ";" - none of those
'     can begin a new statement on their own, so they can only be
'     continuing whatever came before (and for "}" specifically, the spec's
'     own ASI rule already auto-inserts a semicolon right before a "}" when
'     needed, with or without a line break there).
' First version of this script joined EVERY line unconditionally, which
' broke sandstorm/components/load.js: `let _systemConfig = { ... start: []
' }` has no explicit trailing semicolon (relies on ASI + the real newline
' after the closing "}"), so blindly gluing the next statement
' (`app.dom = {};`) onto it with a space produced `} app.dom = {};` - a
' genuine parse error, caught by running `node --check` across the whole
' minified output before shipping this. Neither side of that specific join
' matches this function's safe conditions ("start: []" ends in "]", "}"
' starts with "}" but that's the PREVIOUS line here, not next) - so this
' version correctly leaves that line break in place instead of guessing.
Function CanJoin(prevLine, nextLine)
    Dim lastCh, firstCh
    lastCh = Right(prevLine, 1)
    firstCh = Left(nextLine, 1)
    CanJoin = (InStr("{([,;", lastCh) > 0) Or (InStr("}]),;", firstCh) > 0)
End Function

' CleanCssLine already removes whitespace touching "{" "}" ";" "," WITHIN a
' line, but a lot of this codebase's CSS puts the closing "}" of a rule on
' its own line - that space comes from the cross-line join below, not from
' inside either line, so it needs the same "no separator" treatment here to
' actually disappear (this is what made `margin: 0; \n }` show up as
' `margin: 0; }` - one space - instead of `margin: 0;}` before this existed).
Function CssJoinSep(prevLine, nextLine)
    Dim lastCh, firstCh
    lastCh = Right(prevLine, 1)
    firstCh = Left(nextLine, 1)
    If InStr("{};,", lastCh) > 0 Or InStr("{};,", firstCh) > 0 Then
        CssJoinSep = ""
    Else
        CssJoinSep = " "
    End If
End Function

Function MinifyText(text, isJs)
    Dim stripped, lines, i, ln, trimmed
    Dim cleanLines() : ReDim cleanLines(UBound(Split(text, vbLf)))
    Dim cnt : cnt = 0

    stripped = reBlockComment.Replace(text, "")
    lines = Split(stripped, vbLf)
    For i = 0 To UBound(lines)
        ln = Replace(lines(i), vbCr, "")
        If isJs Then
            ln = CleanCodeLine(ln)
        Else
            ln = CleanCssLine(ln)
        End If
        trimmed = Trim(ln)
        If trimmed <> "" Then
            cleanLines(cnt) = trimmed
            cnt = cnt + 1
        End If
    Next

    ' Line breaks are dropped where CanJoin()/CssJoinSep() say it's provably
    ' safe to do so - CSS never keeps the line break itself (no ASI-style
    ' hazard), but DOES still choose between a single space or no separator
    ' at all depending on what's on each side (see CssJoinSep). Joined lines
    ' otherwise get a single space (not concatenated directly), so e.g.
    ' `const x = 1` followed by `const y = 2` doesn't become `xconst`/similar.
    Dim outBuf, j, sep
    outBuf = ""
    For j = 0 To cnt - 1
        outBuf = outBuf & cleanLines(j)
        If j < cnt - 1 Then
            If Not isJs Then
                sep = CssJoinSep(cleanLines(j), cleanLines(j + 1))
            ElseIf IsBareAsiKeyword(cleanLines(j)) Then
                sep = vbLf
            ElseIf CanJoin(cleanLines(j), cleanLines(j + 1)) Then
                sep = " "
            Else
                sep = vbLf
            End If
            outBuf = outBuf & sep
        End If
    Next
    MinifyText = outBuf
End Function

' ---- Folder walk ----

Sub EnsureFolder(path)
    Dim parent
    If fso.FolderExists(path) Then Exit Sub
    parent = fso.GetParentFolderName(path)
    If parent <> "" And Not fso.FolderExists(parent) Then EnsureFolder parent
    fso.CreateFolder path
End Sub

Dim totalFiles, totalBefore, totalAfter, copiedAsIs
totalFiles = 0 : totalBefore = 0 : totalAfter = 0 : copiedAsIs = 0

Sub ProcessFile(f, isJs)
    Dim relPath, srcText, minText, outPath, outFolder
    relPath = Mid(f.Path, Len(rootPath) + 2)
    srcText = ReadUtf8(f.Path)
    minText = MinifyText(srcText, isJs)

    outPath = distPath & "\" & relPath
    outFolder = fso.GetParentFolderName(outPath)
    EnsureFolder outFolder
    WriteUtf8NoBom outPath, minText

    totalFiles = totalFiles + 1
    totalBefore = totalBefore + f.Size
    totalAfter = totalAfter + fso.GetFile(outPath).Size
End Sub

' Everything that isn't a minifiable .js/.css (already-minified libraries,
' index.html, images, wallpaper, fonts, etc.) is copied into dist\ byte-for-
' byte, unmodified, at its same relative path - this is what makes dist\ a
' complete, directly runnable mirror of the project (e.g. `python -m
' http.server` from inside dist\) instead of just a size-comparison output.
Sub CopyVerbatim(f)
    Dim relPath, outPath, outFolder
    relPath = Mid(f.Path, Len(rootPath) + 2)
    outPath = distPath & "\" & relPath
    outFolder = fso.GetParentFolderName(outPath)
    EnsureFolder outFolder
    fso.CopyFile f.Path, outPath, True
    copiedAsIs = copiedAsIs + 1
End Sub

Sub WalkAndMinify(folder)
    Dim f, sub_, ext, isMinifiable
    For Each f In folder.Files
        ext = LCase(fso.GetExtensionName(f.Name))
        isMinifiable = (ext = "js" Or ext = "css") And (InStr(LCase(f.Name), ".min.") = 0)
        If isMinifiable Then
            ProcessFile f, (ext = "js")
        Else
            CopyVerbatim f
        End If
    Next
    For Each sub_ In folder.SubFolders
        Dim nameLower, skip
        nameLower = LCase(sub_.Name)
        skip = (nameLower = "dist" Or nameLower = ".claude" Or nameLower = ".git")
        If Not skip Then WalkAndMinify sub_
    Next
End Sub

' ---- Run ----

WalkAndMinify fso.GetFolder(rootPath)

Dim pctSaved
If totalBefore > 0 Then
    pctSaved = Round((1 - (totalAfter / totalBefore)) * 100, 1)
Else
    pctSaved = 0
End If

Dim summary
summary = "Filer minifierade: " & totalFiles & vbCrLf
summary = summary & "Kopierade oforandrade (.min.-filer, html, bilder osv): " & copiedAsIs & vbCrLf
summary = summary & "Storlek fore: " & totalBefore & " bytes" & vbCrLf
summary = summary & "Storlek efter: " & totalAfter & " bytes" & vbCrLf
summary = summary & "Sparat: " & pctSaved & " %" & vbCrLf & vbCrLf
summary = summary & "Utdata: " & distPath

MsgBox summary, 64, "minify.vbs klar"
