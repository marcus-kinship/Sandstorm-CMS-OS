Option Explicit

' ============================================================================
' combine.vbs (v2)
'
' Concatenates selected source files into a single output file, per bucket.
' Two things can happen to each file, decided automatically per FILE (not
' per bucket - a bucket can freely mix both kinds):
'
'   WRAP mode    - a file with ZERO top-level `import`/`export` gets wrapped
'                  in its own `(function () { ... })();` before being
'                  concatenated, so it keeps its own private scope - two
'                  such files that happen to both declare e.g. `const x`
'                  can't collide. This is what v1 of this script always did,
'                  for every file, because every bucket back then was
'                  pre-filtered to only ever contain zero-import/export
'                  files.
'   FLATTEN mode - a file that DOES use `import`/`export` gets its `export `
'                  prefixes stripped (declarations kept) and its `import`
'                  lines resolved: an import whose target is ALSO selected
'                  in this run is dropped (that name will already be in the
'                  shared top-level scope once the target's own content is
'                  flattened in); an import whose target is NOT selected is
'                  kept as a real import, with its specifier RECOMPUTED
'                  relative to the combined OUTPUT file's own folder (not
'                  copied verbatim from the source file's original relative
'                  path - those can differ once files from a deeper folder
'                  land in one shared output file elsewhere, e.g. startmenu/
'                  search.js's `../search/actions.js` needs to become
'                  `./search/actions.js` once it's inside startmenu.combined.js,
'                  which lives one folder up from where search.js used to be).
'                  The combined file stays a real ES module because of these
'                  kept imports - correct, not a bug. No IIFE
'                  wrap - the whole point is a shared scope so these files'
'                  real cross-references to each other keep resolving.
'                  One extra case: `import * as X from './sibling.js'` where
'                  sibling.js IS selected - the import line is replaced with
'                  a synthesized `const X = { name1, name2, ... };` built
'                  from sibling.js's own exported names (real example this
'                  was written for: sandstorm/components/ui/window/
'                  dragresize.js does `import * as snapZones from
'                  './snap-zones.js'`).
'
' Because FLATTEN mode files share one scope, two of them could in principle
' both declare the same top-level name and collide - something WRAP mode's
' per-file IIFE always prevented. Before writing any bucket's output, every
' selected file's exported top-level names are collected and checked for
' duplicates across the whole selection; if two files export the same name,
' the bucket is refused and both filenames are named in the message, rather
' than silently producing a file where the second declaration wins.
'
' Bucket list - see the header of each Dim .../Sub for where each one's
' files came from and why. Roughly: System/UI (unchanged since v1, always
' WRAP mode - zero import/export in any of those files), Taskbar/Window/
' Startmenu (subsystem folders - mostly FLATTEN mode, Taskbar is the
' exception since none of its files use `export` at all), and one bucket
' per program under program/ (always FLATTEN mode - every program file uses
' `export`), always excluding that program's own setup.js (kept as its own
' untouched file - required, `app.includeProgram()` loads it by that exact
' path). CSS buckets are separate and much simpler - CSS has no scope/
' import concept, so "combining" CSS is always just plain concatenation.
'
' Each bucket's fully-assembled output buffer is also run through the same
' minification logic as minify.vbs (ported verbatim - see the "Minification"
' section below) right before it's written: comments and redundant
' whitespace/line-breaks stripped, same as a `minify.vbs` run would do to any
' single file. Goal is explicit - fewer FILES (this script's own job) AND
' fewer BYTES per file (minify.vbs's job), together meaning fewer AND
' lighter HTTP requests when dist\ is actually served.
'
' Only ever PRODUCES files under dist\ - never deletes or modifies anything
' in the original source tree. It DOES generate a new, runnable dist\
' index.html (see "dist\index.html generation" below) that wires whichever
' buckets were combined this run into the real boot sequence, falling back
' to the untouched originals for anything not combined - but it never
' touches the real index.html/load.js/app.includeProgram() themselves, so
' the actual live app (served from the project root, not dist\) is
' completely unaffected by anything this script does, regardless of any
' mistake in a bucket's output.
'
' No external dependencies (no Node/npm) - run via double-click (wscript.exe)
' or `cscript combine.vbs` from a terminal. Same conventions as the existing
' count_lines.vbs in this folder.
' ============================================================================

Dim fso, rootPath, distPath
Set fso = CreateObject("Scripting.FileSystemObject")
rootPath = fso.GetParentFolderName(WScript.ScriptFullName)
distPath = rootPath & "\dist"
If Not fso.FolderExists(distPath) Then fso.CreateFolder distPath

Sub EnsureFolder(path)
    Dim parent
    If fso.FolderExists(path) Then Exit Sub
    parent = fso.GetParentFolderName(path)
    If parent <> "" And Not fso.FolderExists(parent) Then EnsureFolder parent
    fso.CreateFolder path
End Sub

' ---- UTF-8 aware file I/O (FileSystemObject.OpenTextFile only supports
' ASCII/system codepage or UTF-16 "Unicode" - this codebase's source files
' contain UTF-8 characters (accented letters, arrows, symbols in comments/
' strings), so plain FSO reads/writes would corrupt them). ADODB.Stream with
' an explicit charset handles real UTF-8 correctly. ----

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

' ADODB.Stream always prepends a 3-byte UTF-8 BOM when writing text with
' Charset="utf-8" - switch the stream to binary mode after writing and skip
' those first 3 bytes before saving, so the output file has no BOM (matching
' the source files it was built from).
Sub WriteUtf8NoBom(filePath, text)
    Dim s, bin, bytes
    Set s = CreateObject("ADODB.Stream")
    s.Type = 2
    s.Charset = "utf-8"
    s.Open
    s.WriteText text
    s.Position = 0
    s.Type = 1 ' adTypeBinary
    s.Position = 3 ' skip the UTF-8 BOM
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

' ---- Minification (ported verbatim from minify.vbs - same functions, same
' rules, so combine.vbs's output gets the same "lightweight, fewer server
' calls" treatment: fewer FILES via combining here, AND fewer BYTES per file
' via this. Applied to each bucket's fully-assembled output buffer right
' before writing - see the MinifyText call in CombineGroup/CombineCssGroup
' below. See minify.vbs's own header comment for the full rationale/
' limitations of each step; not re-explained in depth here to avoid the two
' copies drifting out of sync in wording while staying identical in logic. ----

Dim reBlockComment
Set reBlockComment = New RegExp
reBlockComment.Pattern = "/\*[\s\S]*?\*/"
reBlockComment.Global = True
reBlockComment.MultiLine = True

Function IsRegexAllowed(prevChar)
    If prevChar = "" Then
        IsRegexAllowed = True
    Else
        IsRegexAllowed = (InStr("([{,;:=!&|?+-*%^~<>", prevChar) > 0)
    End If
End Function

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
                        ' right after "{" "}" ";" "," - drop entirely
                    ElseIf Not lastWasSpace And outLn <> "" Then
                        outLn = outLn & " "
                        lastWasSpace = True
                    End If
                ElseIf ch = "{" Or ch = "}" Or ch = ";" Or ch = "," Then
                    If lastWasSpace Then outLn = Left(outLn, Len(outLn) - 1)
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
                            If peek <> "'" And peek <> Chr(34) Then state = "url"
                        End If
                    End If
                End If
        End Select
        i = i + 1
    Loop
    CleanCssLine = outLn
End Function

Function IsBareAsiKeyword(s)
    IsBareAsiKeyword = (s = "return" Or s = "break" Or s = "continue" Or s = "throw")
End Function

Function CanJoin(prevLine, nextLine)
    Dim lastCh, firstCh
    lastCh = Right(prevLine, 1)
    firstCh = Left(nextLine, 1)
    CanJoin = (InStr("{([,;", lastCh) > 0) Or (InStr("}]),;", firstCh) > 0)
End Function

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

    Dim outBuf2, j, sep
    outBuf2 = ""
    For j = 0 To cnt - 1
        outBuf2 = outBuf2 & cleanLines(j)
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
            outBuf2 = outBuf2 & sep
        End If
    Next
    MinifyText = outBuf2
End Function

' ---- import/export detection + parsing ----

Dim reModule
Set reModule = New RegExp
reModule.Pattern = "^\s*(import|export)\s"
reModule.MultiLine = True
reModule.Global = False
reModule.IgnoreCase = False

Function HasImportOrExport(fileRelPath)
    HasImportOrExport = reModule.Test(ReadUtf8(rootPath & "\" & fileRelPath))
End Function

' `export function NAME`, `export async function NAME`, `export const NAME`,
' `export let NAME`, `export class NAME` - captures the declared name.
' (Checked: no `export default` and no `export {...} from '...'` anywhere in
' any of this script's target files - only these plain declaration forms and
' bare `export { a, b };` restatements, handled separately below.)
Dim reExportDecl
Set reExportDecl = New RegExp
reExportDecl.Pattern = "^(\s*)export\s+(async\s+)?(function\*?|const|let|var|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)"
reExportDecl.IgnoreCase = False
reExportDecl.Global = False

' Strips just the leading "export " keyword (keeping any leading whitespace
' and the rest of the line, including a following "async ").
Dim reStripExportPrefix
Set reStripExportPrefix = New RegExp
reStripExportPrefix.Pattern = "^(\s*)export\s+"
reStripExportPrefix.IgnoreCase = False
reStripExportPrefix.Global = False

' Bare re-export restatement, e.g. `export { setMainMenu, getMainMenu };` -
' no "from", so it's re-exporting names already imported/declared in this
' same file - once flattened those names are already in shared scope, so
' this whole line is simply dropped.
Dim reExportBare
Set reExportBare = New RegExp
reExportBare.Pattern = "^\s*export\s*\{[^}]*\}\s*;?\s*$"
reExportBare.IgnoreCase = False
reExportBare.Global = False

' `import { a, b } from '...'` or `import * as X from '...'`.
Dim reImportFrom
Set reImportFrom = New RegExp
reImportFrom.Pattern = "^\s*import\s+(\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)|\{[^}]*\})\s+from\s+['""]([^'""]+)['""]\s*;?\s*$"
reImportFrom.IgnoreCase = False
reImportFrom.Global = False

' `import './sibling.js';` - side-effect only, no bindings.
Dim reImportSideEffect
Set reImportSideEffect = New RegExp
reImportSideEffect.Pattern = "^\s*import\s+['""]([^'""]+)['""]\s*;?\s*$"
reImportSideEffect.IgnoreCase = False
reImportSideEffect.Global = False

' Resolves an import specifier ("./x.js", "../core/y.js") against the
' importing file's own folder into a root-relative path ("sandstorm\...\x.js"),
' so it can be compared against the current selection to decide in-group vs
' outside-group. fso.GetAbsolutePathName does the real ".."/"." resolution.
Function ResolveImportTarget(importingRelPath, specifier)
    Dim importingFullPath, spec, combined, absPath
    importingFullPath = rootPath & "\" & importingRelPath
    spec = Replace(specifier, "/", "\")
    combined = fso.BuildPath(fso.GetParentFolderName(importingFullPath), spec)
    absPath = fso.GetAbsolutePathName(combined)
    If LCase(Left(absPath, Len(rootPath))) = LCase(rootPath) Then
        ResolveImportTarget = Mid(absPath, Len(rootPath) + 2)
    Else
        ResolveImportTarget = absPath ' outside the project entirely (won't match any selection either way)
    End If
End Function

' Recomputes a relative import specifier from the COMBINED OUTPUT file's own
' folder to an already-resolved root-relative target path. Needed because a
' "kept as a real import" line (target outside the group) was written
' relative to its ORIGINAL source file's folder, but FLATTEN mode can
' concatenate files from a DEEPER folder into an output file that lives
' higher up - the same literal specifier text would then resolve to the
' wrong place. Real case: sandstorm/components/startmenu/search.js's `import
' ... from '../search/actions.js'` (correct relative to startmenu/) ends up
' inside startmenu.combined.js, which lives one level up at
' sandstorm/components/ - the unchanged text would resolve to
' sandstorm/search/actions.js instead of sandstorm/components/search/
' actions.js. Found live via a 404 in a boot test, not by inspection.
Function RelativeSpecifierFromOutput(outRelPath, targetRootRelPath)
    Dim outDir, outParts, tgtParts, i, common, up, rest
    outDir = fso.GetParentFolderName(rootPath & "\" & outRelPath)
    outDir = Mid(outDir, Len(rootPath) + 2) ' back to root-relative
    outParts = Split(outDir, "\")
    tgtParts = Split(targetRootRelPath, "\")

    common = 0
    Do While common <= UBound(outParts) And common <= UBound(tgtParts)
        If LCase(outParts(common)) <> LCase(tgtParts(common)) Then Exit Do
        common = common + 1
    Loop

    up = ""
    For i = common To UBound(outParts)
        up = up & "../"
    Next

    rest = ""
    For i = common To UBound(tgtParts)
        If rest <> "" Then rest = rest & "/"
        rest = rest & tgtParts(i)
    Next
    rest = Replace(rest, "\", "/")

    If up = "" Then
        RelativeSpecifierFromOutput = "./" & rest
    Else
        RelativeSpecifierFromOutput = up & rest
    End If
End Function

' ---- Export-name pre-scan (needed for collision checking + namespace-object synthesis) ----

Function BuildExportMap(fileList)
    Dim map : Set map = CreateObject("Scripting.Dictionary")
    Dim i, path, content, lines, j, ln, names, m, nm
    For i = 0 To UBound(fileList)
        path = fileList(i)
        Set names = CreateObject("Scripting.Dictionary")
        content = ReadUtf8(rootPath & "\" & path)
        lines = Split(Replace(content, vbCr, ""), vbLf)
        For j = 0 To UBound(lines)
            ln = lines(j)
            If reExportDecl.Test(ln) Then
                Set m = reExportDecl.Execute(ln)(0)
                nm = m.SubMatches(3)
                If Len(nm) > 0 And Not names.Exists(nm) Then names.Add nm, True
            End If
        Next
        map.Add LCase(path), names
    Next
    Set BuildExportMap = map
End Function

Function ExportNamesJoined(exportMap, resolvedPath)
    Dim key : key = LCase(resolvedPath)
    If Not exportMap.Exists(key) Then
        ExportNamesJoined = ""
        Exit Function
    End If
    Dim names : Set names = exportMap.Item(key)
    Dim k, out2 : out2 = ""
    For Each k In names.Keys
        If out2 <> "" Then out2 = out2 & ", "
        out2 = out2 & k
    Next
    ExportNamesJoined = out2
End Function

' Names that are risky to declare as a bare top-level identifier in a
' FLATTEN-mode shared scope: unrelated sibling files in the same group may
' make legitimate use of the REAL browser global of the same name (e.g.
' `window.innerWidth`) - a sibling that also exports a top-level name like
' `window` silently shadows that global for the WHOLE combined file once
' flattened together, instead of throwing at the declaration site. Real
' case: sandstorm/components/ui/window/dialogs.js exports `function
' window(...)`, while snap-zones.js/menu-body.js/dragresize.js all use the
' real global `window.innerWidth`/`window.getComputedStyle` throughout -
' found live via a boot test, not by inspection.
Dim dangerousGlobalNames
Set dangerousGlobalNames = CreateObject("Scripting.Dictionary")
dangerousGlobalNames.Add "window", True
dangerousGlobalNames.Add "self", True
dangerousGlobalNames.Add "top", True
dangerousGlobalNames.Add "parent", True
dangerousGlobalNames.Add "frames", True
dangerousGlobalNames.Add "name", True
dangerousGlobalNames.Add "status", True
dangerousGlobalNames.Add "location", True
dangerousGlobalNames.Add "history", True
' NOT "event" - it's a deprecated/legacy IE-only global (window.event), never
' referenced bare in this codebase (checked), and a name that real code very
' reasonably wants for its own domain concepts (sandstorm/components/ui/
' window/state.js exports its own `event(...)` function) - including it here
' would false-positive-block buckets for no real safety benefit.
dangerousGlobalNames.Add "document", True
dangerousGlobalNames.Add "navigator", True
dangerousGlobalNames.Add "screen", True

' Scans every selected file's import lines for "originalName as aliasName"
' where originalName is a dangerous global name AND is exported by another
' selected file. Returns a Dictionary of resolvedTargetPath(lowercase) ->
' Dictionary of originalName -> aliasName. FlattenFile uses this to rename
' the DECLARATION itself (not just wrap it in an extra alias const), so the
' risky name never exists as a bare top-level binding in the output at all -
' the same alias the original author already chose for exactly this reason
' (e.g. `import { window as windowFn }`) becomes the real declared name.
Function BuildDangerousRenameMap(selectedPaths, exportMap)
    Dim renameMap : Set renameMap = CreateObject("Scripting.Dictionary")
    Dim p, content, lines, j, ln, mIF, nsName, bracesRaw, entries, entry, asPos, origName, aliasName, spec, resolved, tgtMap
    For Each p In selectedPaths
        content = ReadUtf8(rootPath & "\" & p)
        content = NormalizeMultilineImports(content)
        lines = Split(Replace(content, vbCr, ""), vbLf)
        For j = 0 To UBound(lines)
            ln = lines(j)
            If reImportFrom.Test(ln) Then
                Set mIF = reImportFrom.Execute(ln)(0)
                nsName = mIF.SubMatches(1)
                If Len(nsName) = 0 Then ' named-import branch only ("* as X" can't rename a declaration)
                    spec = mIF.SubMatches(2)
                    resolved = ResolveImportTarget(p, spec)
                    If exportMap.Exists(LCase(resolved)) Then
                        bracesRaw = mIF.SubMatches(0)
                        bracesRaw = Mid(bracesRaw, 2, Len(bracesRaw) - 2) ' strip { }
                        entries = Split(bracesRaw, ",")
                        For Each entry In entries
                            entry = Trim(entry)
                            asPos = InStr(1, entry, " as ", vbTextCompare)
                            If asPos > 0 Then
                                origName = Trim(Left(entry, asPos - 1))
                                aliasName = Trim(Mid(entry, asPos + 4))
                                If dangerousGlobalNames.Exists(origName) And origName <> aliasName Then
                                    If Not renameMap.Exists(LCase(resolved)) Then
                                        Set tgtMap = CreateObject("Scripting.Dictionary")
                                        renameMap.Add LCase(resolved), tgtMap
                                    End If
                                    Set tgtMap = renameMap.Item(LCase(resolved))
                                    If Not tgtMap.Exists(origName) Then tgtMap.Add origName, aliasName
                                End If
                            End If
                        Next
                    End If
                End If
            End If
        Next
    Next
    Set BuildDangerousRenameMap = renameMap
End Function

' Refuses a combine if a selected file declares a top-level name that
' shadows a core browser/JS global (window, document, ...) AND no in-group
' import aliases it to something else - renaming needs a real target name
' to rename TO, and guessing one automatically would be exactly the kind of
' silent, unreviewable transform this whole script tries to avoid. Returns
' "" if clean (no dangerous names, or every one found has a rename via
' renameMap), or a human-readable description of the first unrenamable one.
Function FindUnrenamableDangerousNames(selectedFiles, exportMap, renameMap)
    Dim i, path, fileNames, nameKey, tgtMap, hasRename
    FindUnrenamableDangerousNames = ""
    For i = 0 To UBound(selectedFiles)
        path = selectedFiles(i)
        If exportMap.Exists(LCase(path)) Then
            Set fileNames = exportMap.Item(LCase(path))
            For Each nameKey In fileNames.Keys
                If dangerousGlobalNames.Exists(nameKey) Then
                    hasRename = False
                    If renameMap.Exists(LCase(path)) Then
                        Set tgtMap = renameMap.Item(LCase(path))
                        If tgtMap.Exists(nameKey) Then hasRename = True
                    End If
                    If Not hasRename Then
                        FindUnrenamableDangerousNames = "'" & nameKey & "' i " & path & " skuggar webblasarens globala '" & nameKey & "' - ingen import i valet alias:ar den (t.ex. 'import { " & nameKey & " as xyz }'), sa den kan inte bytas namn pa sakert."
                        Exit Function
                    End If
                End If
            Next
        End If
    Next
End Function

' Refuses a combine if two selected files export the same top-level name -
' impossible in WRAP mode (each file has its own IIFE scope) but a real risk
' once FLATTEN-mode files start sharing one scope. Returns "" if clean, or a
' human-readable description of the first collision found.
Function CheckCollisions(selectedFiles, exportMap)
    Dim seen : Set seen = CreateObject("Scripting.Dictionary")
    Dim i, nameKey, path, fileNames
    CheckCollisions = ""
    For i = 0 To UBound(selectedFiles)
        path = selectedFiles(i)
        If exportMap.Exists(LCase(path)) Then
            Set fileNames = exportMap.Item(LCase(path))
            For Each nameKey In fileNames.Keys
                If seen.Exists(nameKey) Then
                    CheckCollisions = "'" & nameKey & "' deklareras bade i " & seen.Item(nameKey) & " och i " & path
                    Exit Function
                Else
                    seen.Add nameKey, path
                End If
            Next
        End If
    Next
End Function

' Real files in this codebase wrap a long named-import list across several
' lines, e.g.:
'   import {
'       fadeOut, getOrder,
'       ...
'   } from './menu-body.js';
' (both sandstorm/components/ui/window/index.js and .../startmenu/index.js
' do this) - FlattenFile's line-by-line scanner can't match that against the
' single-line reImportFrom pattern. Collapses every such block (found via a
' multi-line, non-greedy "{...}" match) down to one line - internal
' newlines replaced with a single space, runs of spaces collapsed to one -
' BEFORE the file is split into lines, so the existing single-line matching
' works unchanged. Only touches text that's actually inside an
' `import {...} from '...'` span, nothing else in the file.
Function NormalizeMultilineImports(text)
    Dim re, matches, m, result, lastEnd, matchText, cleaned, i
    Set re = New RegExp
    re.Pattern = "import\s*\{[\s\S]*?\}\s*from\s*['""][^'""]+['""]\s*;?"
    re.Global = True
    re.MultiLine = True
    Set matches = re.Execute(text)
    result = ""
    lastEnd = 1
    For i = 0 To matches.Count - 1
        Set m = matches(i)
        result = result & Mid(text, lastEnd, m.FirstIndex + 1 - lastEnd)
        matchText = m.Value
        cleaned = Replace(Replace(matchText, vbCrLf, " "), vbLf, " ")
        Do While InStr(cleaned, "  ") > 0
            cleaned = Replace(cleaned, "  ", " ")
        Loop
        result = result & cleaned
        lastEnd = m.FirstIndex + Len(m.Value) + 1
    Next
    result = result & Mid(text, lastEnd)
    NormalizeMultilineImports = result
End Function

' ---- FLATTEN mode: rewrite one file's lines ----

Function FlattenFile(fileRelPath, selectedSet, exportMap, renameMap, outRelPath)
    Dim content, lines, i, ln, out2
    content = ReadUtf8(rootPath & "\" & fileRelPath)
    content = NormalizeMultilineImports(content)
    lines = Split(Replace(content, vbCr, ""), vbLf)
    out2 = ""

    Dim myRenames : Set myRenames = Nothing
    If renameMap.Exists(LCase(fileRelPath)) Then Set myRenames = renameMap.Item(LCase(fileRelPath))

    For i = 0 To UBound(lines)
        ln = lines(i)

        If reExportBare.Test(ln) Then
            ' bare "export { a, b };" restatement - names already in shared
            ' scope once their owning file is flattened in; drop entirely.

        ElseIf reExportDecl.Test(ln) Then
            Dim mDecl, declName, stripped
            Set mDecl = reExportDecl.Execute(ln)(0)
            declName = mDecl.SubMatches(3)
            stripped = reStripExportPrefix.Replace(ln, "$1")
            If Not (myRenames Is Nothing) Then
                If myRenames.Exists(declName) Then
                    ' this name shadows a browser global (see
                    ' dangerousGlobalNames) - rename the DECLARATION itself
                    ' to the alias an in-group consumer already uses, so the
                    ' risky name never exists as a bare top-level binding.
                    Dim reRename : Set reRename = New RegExp
                    reRename.Pattern = "^(\s*)(async\s+)?(function\*?|const|let|var|class)\s+" & declName & "\b"
                    reRename.IgnoreCase = False
                    reRename.Global = False
                    stripped = reRename.Replace(stripped, "$1$2$3 " & myRenames.Item(declName))
                End If
            End If
            out2 = out2 & stripped & vbLf

        ElseIf reImportFrom.Test(ln) Then
            Dim mIF, nsName, spec, resolved
            Set mIF = reImportFrom.Execute(ln)(0)
            nsName = mIF.SubMatches(1) ' set only for the "* as X" branch
            spec = mIF.SubMatches(2)
            resolved = ResolveImportTarget(fileRelPath, spec)
            If selectedSet.Exists(LCase(resolved)) Then
                If Len(nsName) > 0 Then
                    out2 = out2 & "const " & nsName & " = { " & ExportNamesJoined(exportMap, resolved) & " };" & vbLf
                Else
                    ' named-import branch: a plain "{ a, b }" needs nothing
                    ' more (both names are already in shared scope once the
                    ' target's own content is flattened in), but an aliased
                    ' entry like "{ window as windowFn }" does - the sibling's
                    ' own declaration keeps its ORIGINAL name after the
                    ' export-prefix-strip UNLESS it was already renamed above
                    ' (dangerous-global case) - only emit the const shim when
                    ' that didn't happen. Real case: sandstorm/components/ui/
                    ' window/index.js imports "window as windowFn" from
                    ' element.js... except it's actually dialogs.js, and
                    ' `window` IS dangerous, so this specific case is now
                    ' handled by the rename above instead of this shim.
                    Dim bracesRaw, aliasEntries, aliasEntry, asPos, origName, aliasName
                    Dim srcRenames : Set srcRenames = Nothing
                    If renameMap.Exists(LCase(resolved)) Then Set srcRenames = renameMap.Item(LCase(resolved))
                    bracesRaw = mIF.SubMatches(0)
                    bracesRaw = Mid(bracesRaw, 2, Len(bracesRaw) - 2) ' strip { }
                    aliasEntries = Split(bracesRaw, ",")
                    For Each aliasEntry In aliasEntries
                        aliasEntry = Trim(aliasEntry)
                        asPos = InStr(1, aliasEntry, " as ", vbTextCompare)
                        If asPos > 0 Then
                            origName = Trim(Left(aliasEntry, asPos - 1))
                            aliasName = Trim(Mid(aliasEntry, asPos + 4))
                            Dim alreadyRenamed : alreadyRenamed = False
                            If Not (srcRenames Is Nothing) Then
                                If srcRenames.Exists(origName) Then
                                    If srcRenames.Item(origName) = aliasName Then alreadyRenamed = True
                                End If
                            End If
                            If origName <> "" And aliasName <> "" And origName <> aliasName And Not alreadyRenamed Then
                                out2 = out2 & "const " & aliasName & " = " & origName & ";" & vbLf
                            End If
                        End If
                    Next
                End If
            Else
                ' outside this selection - keep as a real import, but the
                ' specifier must be recomputed relative to the COMBINED
                ' OUTPUT file's own folder, not the original source file's
                ' folder (they can differ - see RelativeSpecifierFromOutput).
                out2 = out2 & Replace(ln, spec, RelativeSpecifierFromOutput(outRelPath, resolved)) & vbLf
            End If

        ElseIf reImportSideEffect.Test(ln) Then
            Dim mSE, spec2, resolved2
            Set mSE = reImportSideEffect.Execute(ln)(0)
            spec2 = mSE.SubMatches(0)
            resolved2 = ResolveImportTarget(fileRelPath, spec2)
            If selectedSet.Exists(LCase(resolved2)) Then
                ' already inlined elsewhere in this same combine - drop.
            Else
                out2 = out2 & Replace(ln, spec2, RelativeSpecifierFromOutput(outRelPath, resolved2)) & vbLf
            End If

        Else
            out2 = out2 & ln & vbLf
        End If
    Next
    FlattenFile = out2
End Function

' ---- Selection parsing: "alla"/"all", comma list, ranges (e.g. "1,4-6") ----

Function ExpandSelection(input, maxN)
    Dim sel : Set sel = CreateObject("Scripting.Dictionary")
    Dim norm : norm = Trim(LCase(input))
    If norm = "alla" Or norm = "all" Then
        Dim k
        For k = 1 To maxN
            sel.Add k, True
        Next
        Set ExpandSelection = sel
        Exit Function
    End If
    Dim parts, p, rangeParts, lo, hi, n
    parts = Split(input, ",")
    For Each p In parts
        p = Trim(p)
        If p = "" Then
            ' skip
        ElseIf InStr(p, "-") > 0 Then
            rangeParts = Split(p, "-")
            If UBound(rangeParts) = 1 And IsNumeric(Trim(rangeParts(0))) And IsNumeric(Trim(rangeParts(1))) Then
                lo = CInt(Trim(rangeParts(0)))
                hi = CInt(Trim(rangeParts(1)))
                For n = lo To hi
                    If n >= 1 And n <= maxN Then
                        If Not sel.Exists(n) Then sel.Add n, True
                    End If
                Next
            End If
        ElseIf IsNumeric(p) Then
            n = CInt(p)
            If n >= 1 And n <= maxN Then
                If Not sel.Exists(n) Then sel.Add n, True
            End If
        End If
    Next
    Set ExpandSelection = sel
End Function

' ---- Per-bucket processing: JS (mixed WRAP/FLATTEN) ----
'
' Returns True if the bucket's output was actually written (so the caller
' can decide whether to wire it into a generated index.html), False if the
' user skipped it, entered an empty selection, or the collision check fired.
' outRelPath is now a path relative to dist\ (e.g.
' "sandstorm\components\system.combined.js"), not a bare filename - so the
' combined output lives at the same relative location its source files came
' from, letting ComponentsRoot/ProgramRoot-relative addressing resolve it
' the same way it resolves any original file.
Function CombineGroup(bucketName, groupFiles, outRelPath)
    CombineGroup = False
    Dim total : total = UBound(groupFiles) + 1
    If total <= 0 Then
        MsgBox bucketName & ": inga filer hittades.", 48, bucketName
        Exit Function
    End If

    Dim i, listStr, tag
    listStr = ""
    For i = 0 To UBound(groupFiles)
        If HasImportOrExport(groupFiles(i)) Then
            tag = "[delar scope]"
        Else
            tag = "[isolerad]"
        End If
        listStr = listStr & (i + 1) & ". " & groupFiles(i) & " " & tag & vbCrLf
    Next

    Dim prompt
    prompt = bucketName & " -- valj filer att slaa ihop (" & total & " st):" & vbCrLf & vbCrLf
    prompt = prompt & listStr & vbCrLf
    prompt = prompt & "[isolerad] = egen scope (IIFE), kan aldrig krocka." & vbCrLf
    prompt = prompt & "[delar scope] = import/export tas bort, delar scope med resten av valet." & vbCrLf
    prompt = prompt & "Ovalda filer som en [delar scope]-fil importerar fraan behaalls som en riktig import." & vbCrLf & vbCrLf
    prompt = prompt & "Skriv 'alla', en kommalista (1,3,5) eller intervall (1,4-6)." & vbCrLf & "Tomt/Avbryt = hoppa over denna grupp."

    Dim answer
    answer = InputBox(prompt, bucketName & " -- valj filer", "alla")
    If Trim(answer) = "" Then
        WScript.Echo bucketName & ": hoppade over."
        Exit Function
    End If

    Dim sel : Set sel = ExpandSelection(answer, total)
    If sel.Count = 0 Then
        MsgBox "Inget giltigt val tolkat -- " & bucketName & " hoppas over.", 48, bucketName
        Exit Function
    End If

    Dim n, selectedPaths() : ReDim selectedPaths(sel.Count - 1)
    Dim idx : idx = 0
    For n = 1 To total
        If sel.Exists(n) Then
            selectedPaths(idx) = groupFiles(n - 1)
            idx = idx + 1
        End If
    Next

    Dim exportMap : Set exportMap = BuildExportMap(selectedPaths)
    Dim collision : collision = CheckCollisions(selectedPaths, exportMap)
    If collision <> "" Then
        MsgBox bucketName & ": kan INTE slaas ihop -- namnkrock: " & collision & vbCrLf & "Ingen fil skrevs.", 48, bucketName & " -- namnkrock"
        Exit Function
    End If

    Dim renameMap : Set renameMap = BuildDangerousRenameMap(selectedPaths, exportMap)
    Dim unrenamable : unrenamable = FindUnrenamableDangerousNames(selectedPaths, exportMap, renameMap)
    If unrenamable <> "" Then
        MsgBox bucketName & ": kan INTE slaas ihop -- " & unrenamable & vbCrLf & "Ingen fil skrevs.", 48, bucketName & " -- global namnkrock"
        Exit Function
    End If

    Dim selectedSet : Set selectedSet = CreateObject("Scripting.Dictionary")
    For n = 0 To UBound(selectedPaths)
        selectedSet.Add LCase(selectedPaths(n)), True
    Next

    Dim outBuf : outBuf = "// Kombinerad bunt: " & bucketName & vbCrLf
    outBuf = outBuf & "// Genererad av combine.vbs -- " & Now() & vbCrLf & vbCrLf

    Dim chosenPath
    For n = 0 To UBound(selectedPaths)
        chosenPath = selectedPaths(n)
        outBuf = outBuf & "// ==== " & chosenPath & " ====" & vbCrLf
        If HasImportOrExport(chosenPath) Then
            outBuf = outBuf & FlattenFile(chosenPath, selectedSet, exportMap, renameMap, outRelPath) & vbCrLf
        Else
            outBuf = outBuf & "(function () {" & vbCrLf & ReadUtf8(rootPath & "\" & chosenPath) & vbCrLf & "})();" & vbCrLf & vbCrLf
        End If
    Next

    ' Same cleanup minify.vbs applies per-file, run once over the whole
    ' assembled bucket: strips comments (including this function's own
    ' "// ==== filename ====" markers - intentional, matches the "remove all
    ' comments" ask) and redundant whitespace/line breaks. Combines the two
    ' goals - fewer FILES (this script's own job) and fewer BYTES per file
    ' (minify.vbs's job) - into one output, for fewer/lighter server calls.
    outBuf = MinifyText(outBuf, True)

    Dim outPath : outPath = distPath & "\" & outRelPath
    EnsureFolder fso.GetParentFolderName(outPath)
    WriteUtf8NoBom outPath, outBuf

    MsgBox bucketName & ": " & (UBound(selectedPaths) + 1) & " filer ihopslagna -> " & outPath, 64, bucketName & " klar"
    CombineGroup = True
End Function

' ---- Per-bucket processing: CSS (plain concatenation, no wrap/flatten concept) ----
'
' Same True/False success return + mirrored-path convention as CombineGroup.

Function CombineCssGroup(bucketName, groupFiles, outRelPath)
    CombineCssGroup = False
    Dim total : total = UBound(groupFiles) + 1
    If total <= 0 Then Exit Function

    Dim i, listStr
    listStr = ""
    For i = 0 To UBound(groupFiles)
        listStr = listStr & (i + 1) & ". " & groupFiles(i) & vbCrLf
    Next

    Dim prompt
    prompt = bucketName & " (CSS) -- valj filer att slaa ihop (" & total & " st):" & vbCrLf & vbCrLf
    prompt = prompt & listStr & vbCrLf
    prompt = prompt & "Skriv 'alla', en kommalista (1,3,5) eller intervall (1,4-6)." & vbCrLf & "Tomt/Avbryt = hoppa over denna grupp."

    Dim answer
    answer = InputBox(prompt, bucketName & " (CSS) -- valj filer", "alla")
    If Trim(answer) = "" Then
        WScript.Echo bucketName & " (CSS): hoppade over."
        Exit Function
    End If

    Dim sel : Set sel = ExpandSelection(answer, total)
    If sel.Count = 0 Then
        MsgBox "Inget giltigt val tolkat -- " & bucketName & " (CSS) hoppas over.", 48, bucketName
        Exit Function
    End If

    Dim outBuf : outBuf = "/* Kombinerad bunt: " & bucketName & " (CSS) */" & vbCrLf & vbCrLf
    Dim n, usedCount : usedCount = 0
    For n = 1 To total
        If sel.Exists(n) Then
            outBuf = outBuf & "/* ==== " & groupFiles(n - 1) & " ==== */" & vbCrLf
            outBuf = outBuf & ReadUtf8(rootPath & "\" & groupFiles(n - 1)) & vbCrLf & vbCrLf
            usedCount = usedCount + 1
        End If
    Next

    outBuf = MinifyText(outBuf, False)

    Dim outPath : outPath = distPath & "\" & outRelPath
    EnsureFolder fso.GetParentFolderName(outPath)
    WriteUtf8NoBom outPath, outBuf
    MsgBox bucketName & " (CSS): " & usedCount & " filer ihopslagna -> " & outPath, 64, bucketName & " (CSS) klar"
    CombineCssGroup = True
End Function

' ---- Folder walk helper (for Program buckets - these trees change often) ----

Function CollectFolderFiles(folderPath, ext, excludeNames)
    Dim raw : raw = ""
    CollectFolderFilesInto folderPath, ext, excludeNames, raw
    CollectFolderFiles = raw
End Function

Sub CollectFolderFilesInto(folderPath, ext, excludeNames, ByRef raw)
    If Not fso.FolderExists(folderPath) Then Exit Sub
    Dim folder, f, sub_
    Set folder = fso.GetFolder(folderPath)
    For Each f In folder.Files
        If LCase(fso.GetExtensionName(f.Name)) = ext Then
            If InStr(1, excludeNames, "|" & LCase(f.Name) & "|", vbTextCompare) = 0 Then
                raw = raw & Mid(f.Path, Len(rootPath) + 2) & vbCrLf
            End If
        End If
    Next
    For Each sub_ In folder.SubFolders
        CollectFolderFilesInto sub_.Path, ext, excludeNames, raw
    Next
End Sub

Function ToArray(raw)
    If Len(raw) > 0 Then
        ToArray = Split(Left(raw, Len(raw) - 2), vbCrLf)
    Else
        Dim emptyArr() : ReDim emptyArr(-1)
        ToArray = emptyArr
    End If
End Function

' ---- Whole-tree verbatim copy (v3) ----
'
' A generated dist\index.html needs everything to actually exist under
' dist\ - not just the combined bundles, since most of the app (program/,
' res/, wallpaper/, notifications/index.js, cursor/index.js, the resource-
' root jQuery libs, etc.) is never touched by any bucket. Copies the whole
' project verbatim into dist\ up front, before any bucket runs, so every
' bucket's own output then simply adds to / overwrites part of an already-
' complete mirror. Same "walk and copy, skip dist\/.claude\/.git\" shape as
' minify.vbs's own copy logic - and, like minify.vbs, every .js/.css file
' (except already-minified third-party libs, same ".min." exclusion rule)
' gets the SAME MinifyText pass applied here too, not just files a bucket
' combines - otherwise anything never touched by any bucket (e.g.
' res/icons/sandstorm.css, an icon-font stylesheet with its own comments/
' whitespace) would stay full-size in dist\, defeating the "lightweight,
' fewer/lighter server calls" goal for the parts of the app this script
' doesn't bundle. Reads from the real source tree either way (never from
' dist\ itself), so this has no effect on what a LATER bucket combines.
Sub CopyEverythingVerbatim(folder)
    Dim f, sub_, relPath, outPath, outFolder, ext, isMinifiable, srcText, minText
    For Each f In folder.Files
        If LCase(f.Name) <> "combine.vbs" Then
            relPath = Mid(f.Path, Len(rootPath) + 2)
            outPath = distPath & "\" & relPath
            outFolder = fso.GetParentFolderName(outPath)
            EnsureFolder outFolder
            ext = LCase(fso.GetExtensionName(f.Name))
            isMinifiable = (ext = "js" Or ext = "css") And (InStr(LCase(f.Name), ".min.") = 0)
            If isMinifiable Then
                srcText = ReadUtf8(f.Path)
                minText = MinifyText(srcText, (ext = "js"))
                WriteUtf8NoBom outPath, minText
            Else
                fso.CopyFile f.Path, outPath, True
            End If
        End If
    Next
    For Each sub_ In folder.SubFolders
        Dim nameLower, skip
        nameLower = LCase(sub_.Name)
        skip = (nameLower = "dist" Or nameLower = ".claude" Or nameLower = ".git")
        If Not skip Then CopyEverythingVerbatim sub_
    Next
End Sub

' ============================================================================
' ---- Bucket definitions ----
' ============================================================================

' -- System / UI (System trimmed from 17 to 13 in v3 - the 4 taskbar/*.js
'    files it used to also include are now EXCLUSIVELY owned by the Taskbar
'    bucket below, so the two buckets are disjoint. Needed once v3 started
'    generating a real dist\index.html: if both System and Taskbar were
'    combined and both got wired into the boot sequence, those 4 files'
'    setup code would otherwise run twice. Zero import/export in any of
'    these 13 - always WRAP mode.) --

' -- System is split into TWO physical bundles, not one, because its 13
'    files are NOT contiguous in load.js's real boot order - UI's 6 files
'    and window.js sit sandwiched between them. That gap is only safe to
'    cross if nothing on either side has a genuine execution-order
'    dependency across it. Checked every file: desktop.js calls
'    `app.ui.caret.init(...)` at true top level (column 0, not inside any
'    function) - sandstorm/components/desktop.js:496 - so it hard-requires
'    ui/caret.js (UI bucket) to have already run. menu.js/svg.js/svg-morph.js
'    have no such dependency either direction (grepped both ways), so they're
'    safe to combine with the early files instead. Result: system-A (config
'    through svg-morph, all of System except the desktop.js span) can stay
'    at System's original first position, before UI; system-B (desktop.js
'    onward) must be inserted at ITS original position, after UI/window. --

Dim systemFilesA(9)
systemFilesA(0) = "sandstorm\components\config.js"
systemFilesA(1) = "sandstorm\components\fonts.js"
systemFilesA(2) = "sandstorm\components\historyManager.js"
systemFilesA(3) = "sandstorm\components\ui.js"
systemFilesA(4) = "sandstorm\components\api.js"
systemFilesA(5) = "sandstorm\components\util.js"
systemFilesA(6) = "sandstorm\components\body.js"
systemFilesA(7) = "sandstorm\components\menu.js"
systemFilesA(8) = "sandstorm\components\svg.js"
systemFilesA(9) = "sandstorm\components\svg-morph.js"

Dim systemFilesB(2)
systemFilesB(0) = "sandstorm\components\desktop.js"
systemFilesB(1) = "sandstorm\components\desktop\icons.js"
systemFilesB(2) = "sandstorm\components\program.js"

Dim systemCssFiles(1)
systemCssFiles(0) = "sandstorm\basic.css"
systemCssFiles(1) = "sandstorm\components\ui.css"

Dim uiFiles(5)
uiFiles(0) = "sandstorm\components\ui\capsLock.js"
uiFiles(1) = "sandstorm\components\ui\caret.js"
uiFiles(2) = "sandstorm\components\ui\calendar.js"
uiFiles(3) = "sandstorm\components\ui\window-modal.js"
uiFiles(4) = "sandstorm\components\ui\toggleWindow.js"
uiFiles(5) = "sandstorm\components\ui\sidopanel.js"

' -- Taskbar: 14 files, zero `export` anywhere in the folder - only
'    index.js has `import` lines (9, all side-effect-only), so every file
'    here ends up WRAP mode; index.js's own trailing app.lock() calls need
'    to run AFTER the 9 it imports, hence the explicit order below rather
'    than an alphabetical folder walk. --

Dim taskbarFiles(13)
taskbarFiles(0)  = "sandstorm\components\taskbar\config.js"
taskbarFiles(1)  = "sandstorm\components\taskbar\overflow.js"
taskbarFiles(2)  = "sandstorm\components\taskbar\menu.js"
taskbarFiles(3)  = "sandstorm\components\taskbar\sort.js"
taskbarFiles(4)  = "sandstorm\components\taskbar\notify.js"
taskbarFiles(5)  = "sandstorm\components\taskbar\icons.js"
taskbarFiles(6)  = "sandstorm\components\taskbar\statusicons.js"
taskbarFiles(7)  = "sandstorm\components\taskbar\addtotaskbar.js"
taskbarFiles(8)  = "sandstorm\components\taskbar\windowanim.js"
taskbarFiles(9)  = "sandstorm\components\taskbar\clock.js"
taskbarFiles(10) = "sandstorm\components\taskbar\showdesktop.js"
taskbarFiles(11) = "sandstorm\components\taskbar\build.js"
taskbarFiles(12) = "sandstorm\components\taskbar\core.js"
taskbarFiles(13) = "sandstorm\components\taskbar\index.js"

Dim taskbarCssFiles(0)
taskbarCssFiles(0) = "sandstorm\components\taskbar\style.css"

' -- Window: 8 files, real named imports throughout (dragresize.js also has
'    the one `import * as snapZones` case) - FLATTEN mode. Order:
'    dependencies before dependents, matching index.js's own import order.
'    No separate CSS file exists for this subsystem (its CSS is injected
'    via inline template strings inside window-modal.js/dialogs.js/
'    menu-body.js, not a standalone .css file). --

Dim windowFiles(7)
windowFiles(0) = "sandstorm\components\ui\window\state.js"
windowFiles(1) = "sandstorm\components\ui\window\snap-zones.js"
windowFiles(2) = "sandstorm\components\ui\window\menu-body.js"
windowFiles(3) = "sandstorm\components\ui\window\lifecycle.js"
windowFiles(4) = "sandstorm\components\ui\window\dragresize.js"
windowFiles(5) = "sandstorm\components\ui\window\element.js"
windowFiles(6) = "sandstorm\components\ui\window\dialogs.js"
windowFiles(7) = "sandstorm\components\ui\window\index.js"

' -- Startmenu: 8 files, real named imports (state.js is the shared base).
'    FLATTEN mode. search.js imports 2 names from ../search/actions.js and
'    ../search/recent.js - both outside this group, so those 2 import lines
'    stay real/unmodified in the output (correct, not a bug). --

Dim startmenuFiles(7)
startmenuFiles(0) = "sandstorm\components\startmenu\state.js"
startmenuFiles(1) = "sandstorm\components\startmenu\buttons.js"
startmenuFiles(2) = "sandstorm\components\startmenu\tabs.js"
startmenuFiles(3) = "sandstorm\components\startmenu\running_apps.js"
startmenuFiles(4) = "sandstorm\components\startmenu\taskbar_dock.js"
startmenuFiles(5) = "sandstorm\components\startmenu\core.js"
startmenuFiles(6) = "sandstorm\components\startmenu\search.js"
startmenuFiles(7) = "sandstorm\components\startmenu\index.js"

Dim startmenuCssFiles(0)
startmenuCssFiles(0) = "sandstorm\components\startmenu.css"

' -- Program buckets: one per program/<name>/ folder, walked at run time
'    (these trees change often - same reasoning v1 used for the original
'    flat Program bucket). setup.js is excluded from the file list itself,
'    not just left unselected - it's not a candidate at all, since it must
'    stay on disk untouched (app.includeProgram() loads it by that exact
'    path). Every remaining program file uses `export` (confirmed for all
'    78 files under program/), so these are always FLATTEN-mode buckets. --

Dim programNames(9)
programNames(0) = "calc"
programNames(1) = "mail"
programNames(2) = "mediaplayer"
programNames(3) = "notepad"
programNames(4) = "solitaire"
programNames(5) = "designer"
programNames(6) = "formbuilder"
programNames(7) = "fotoviewer"
programNames(8) = "gui"
programNames(9) = "voiceinput"

' ============================================================================
' ---- dist\index.html generation (v3) ----
' ============================================================================
'
' The 32 entries of load.js's own `systemfiles` array (sandstorm/components/
' load.js:60-116), reconstructed here as parallel arrays (file/description/
' root/bucket-tag) so a replacement array can be regenerated after knowing
' which buckets actually got combined this run. Every entry maps to AT MOST
' one bucket tag ("system-a"/"system-b"/"ui"/"taskbar"/"window"/"startmenu"/""
' for untouched) - re-verified against the live file so System/Taskbar (the
' one pair that used to overlap, fixed above) and everything else stays
' exactly one-to-one. System is split into two tags/bundles (not one)
' because desktop.js has a genuine top-level dependency on UI having already
' run - see the systemFilesA/systemFilesB comment above for the full reasoning.
Dim sfFile(31), sfDesc(31), sfRoot(31), sfTag(31)
Sub SF(i, f, d, r, t)
    sfFile(i) = f : sfDesc(i) = d : sfRoot(i) = r : sfTag(i) = t
End Sub
SF  0, "config.js",                       "config.js",                       "components", "system-a"
SF  1, "fonts.js",                        "fonts.js",                        "components", "system-a"
SF  2, "notifications/index.js",          "notifications/index.js",          "components", ""
SF  3, "historyManager.js",               "historyManager.js",               "components", "system-a"
SF  4, "ui.js",                           "ui.js",                           "components", "system-a"
SF  5, "api.js",                          "api.js",                          "components", "system-a"
SF  6, "util.js",                         "util.js",                         "components", "system-a"
SF  7, "body.js",                         "body.js",                         "components", "system-a"
SF  8, "ui/capsLock.js",                  "capsLock.js",                     "components", "ui"
SF  9, "ui/caret.js",                     "caret.js",                        "components", "ui"
SF 10, "ui/calendar.js",                  "calendar.js",                     "components", "ui"
SF 11, "ui/window.js",                    "window.js",                       "components", "window"
SF 12, "ui/window-modal.js",              "window-modal.js",                 "components", "ui"
SF 13, "ui/toggleWindow.js",              "toggleWindow.js",                 "components", "ui"
SF 14, "ui/sidopanel.js",                 "sidopanel.js",                    "components", "ui"
SF 15, "menu.js",                         "menu.js",                         "components", "system-a"
SF 16, "svg.js",                          "svg.js",                          "components", "system-a"
SF 17, "svg-morph.js",                    "svg-morph.js",                    "components", "system-a"
SF 18, "cursor/index.js",                 "cursor/index.js",                 "components", ""
SF 19, "desktop.js",                      "desktop.js",                      "components", "system-b"
SF 20, "desktop/icons.js",                "icons.js",                        "components", "system-b"
SF 21, "program.js",                      "program.js",                      "components", "system-b"
SF 22, "taskbar/config.js",               "taskbar/config.js",               "components", "taskbar"
SF 23, "taskbar/overflow.js",             "taskbar/overflow.js",             "components", "taskbar"
SF 24, "taskbar/menu.js",                 "taskbar/menu.js",                 "components", "taskbar"
SF 25, "taskbar/sort.js",                 "taskbar/sort.js",                 "components", "taskbar"
SF 26, "taskbar/index.js",                "taskbar/index.js",                "components", "taskbar"
SF 27, "startmenu.js",                    "startmenu.js",                    "components", "startmenu"
SF 28, "js/jquery-3.7.1.min.js",          "jquery-3.7.1.min.js",             "resources",  ""
SF 29, "js/jquery-ui.min.js",             "jquery-ui.min.js",                "resources",  ""
SF 30, "js/jquery.ui.touch-punch.min.js", "jquery.ui.touch-punch.min.js",    "resources",  ""
SF 31, "js/sortable.min.js",              "sortable.min.js",                 "resources",  ""

' Which combined-file name replaces a given bucket tag's span (matches
' where CombineGroup actually wrote it, per the "Run" section below).
Function CombinedFileFor(tag)
    Select Case tag
        Case "system-a"  : CombinedFileFor = "system-a.combined.js"
        Case "system-b"  : CombinedFileFor = "system-b.combined.js"
        Case "ui"        : CombinedFileFor = "ui.combined.js"
        Case "taskbar"   : CombinedFileFor = "taskbar.combined.js"
        Case "window"    : CombinedFileFor = "window.combined.js"
        Case "startmenu" : CombinedFileFor = "startmenu.combined.js"
        Case Else        : CombinedFileFor = ""
    End Select
End Function

' combinedOk is a Dictionary of bucket-tag -> True for every bucket that
' actually wrote output this run (see the "Run" section). Walks the 32
' entries in order; for a tag whose bucket succeeded, the FIRST entry of
' that tag's span is replaced with one combined-file entry and every
' following entry sharing that tag is skipped - untouched/failed-bucket
' entries are copied through unchanged. Returns the systemfiles array as
' literal JS source text, indented to match index.html's own style.
Function BuildSystemfilesJs(combinedOk)
    Dim inserted : Set inserted = CreateObject("Scripting.Dictionary")
    Dim out2 : out2 = "["
    Dim i, tag, combinedFile
    For i = 0 To 31
        tag = sfTag(i)
        If tag <> "" And combinedOk.Exists(tag) And combinedOk.Item(tag) = True Then
            If Not inserted.Exists(tag) Then
                combinedFile = CombinedFileFor(tag)
                out2 = out2 & vbCrLf & "        { file: " & Chr(34) & combinedFile & Chr(34) & _
                    ", description: " & Chr(34) & combinedFile & Chr(34) & ", root: " & Chr(34) & "components" & Chr(34) & " },"
                inserted.Add tag, True
            End If
            ' else: already inserted for this tag - skip this entry entirely
        Else
            out2 = out2 & vbCrLf & "        { file: " & Chr(34) & sfFile(i) & Chr(34) & _
                ", description: " & Chr(34) & sfDesc(i) & Chr(34) & ", root: " & Chr(34) & sfRoot(i) & Chr(34) & " },"
        End If
    Next
    out2 = out2 & vbCrLf & "      ]"
    BuildSystemfilesJs = out2
End Function

' Copies the real index.html (already present in dist\ via
' CopyEverythingVerbatim) and inserts one `loadingScreen: { systemfiles:
' [...] },` property immediately after `await app.load.system({` - the only
' edit made. load.js's own config-merge (`loadingScreen: {..._systemConfig.
' loadingScreen, ...config.loadingScreen}`) overlays just the `systemfiles`
' key onto its internal defaults, so loaderHTML/files/programs/
' controlpanelPrograms/etc. all keep working unchanged - nothing else in
' index.html needs touching. Program buckets are never referenced here
' (see this file's header comment for why).
Sub GenerateIndexHtml(combinedOk)
    Dim srcPath : srcPath = rootPath & "\index.html"
    If Not fso.FileExists(srcPath) Then
        MsgBox "index.html hittades inte - dist\index.html genererades INTE.", 48, "combine.vbs"
        Exit Sub
    End If

    Dim html : html = ReadUtf8(srcPath)
    Dim marker : marker = "await app.load.system({"
    Dim pos : pos = InStr(html, marker)
    If pos = 0 Then
        MsgBox "Kunde inte hitta '" & marker & "' i index.html - dist\index.html genererades INTE (originalfilen är kopierad oforändrad i stället).", 48, "combine.vbs"
        Exit Sub
    End If

    Dim injected : injected = vbCrLf & "      loadingScreen: { systemfiles: " & BuildSystemfilesJs(combinedOk) & " },"
    Dim newHtml
    newHtml = Left(html, pos + Len(marker) - 1) & injected & Mid(html, pos + Len(marker))

    Dim outPath : outPath = distPath & "\index.html"
    WriteUtf8NoBom outPath, newHtml
End Sub

' ---- Run ----

CopyEverythingVerbatim fso.GetFolder(rootPath)

Dim combinedOk : Set combinedOk = CreateObject("Scripting.Dictionary")

combinedOk.Add "system-a", CombineGroup("System (tidig boot, fore UI)", systemFilesA, "sandstorm\components\system-a.combined.js")
combinedOk.Add "system-b", CombineGroup("System (sen boot: desktop.js, efter UI)", systemFilesB, "sandstorm\components\system-b.combined.js")
CombineCssGroup "System", systemCssFiles, "sandstorm\components\system.combined.css"
combinedOk.Add "ui", CombineGroup("UI", uiFiles, "sandstorm\components\ui.combined.js")
combinedOk.Add "taskbar", CombineGroup("Taskbar", taskbarFiles, "sandstorm\components\taskbar.combined.js")
CombineCssGroup "Taskbar", taskbarCssFiles, "sandstorm\components\taskbar.combined.css"
combinedOk.Add "window", CombineGroup("Window", windowFiles, "sandstorm\components\window.combined.js")
combinedOk.Add "startmenu", CombineGroup("Startmenu", startmenuFiles, "sandstorm\components\startmenu.combined.js")
CombineCssGroup "Startmenu", startmenuCssFiles, "sandstorm\components\startmenu.combined.css"

Dim pIdx, pName, pFolder, pJsFiles, pCssFiles
For pIdx = 0 To UBound(programNames)
    pName = programNames(pIdx)
    pFolder = rootPath & "\program\" & pName
    pJsFiles = ToArray(CollectFolderFiles(pFolder, "js", "|setup.js|"))
    pCssFiles = ToArray(CollectFolderFiles(pFolder, "css", "||"))
    CombineGroup "Program: " & pName, pJsFiles, "program\" & pName & "\" & pName & ".combined.js"
    If UBound(pCssFiles) >= 0 Then
        CombineCssGroup "Program: " & pName, pCssFiles, "program\" & pName & "\" & pName & ".combined.css"
    End If
Next

GenerateIndexHtml combinedOk

Dim wiredSummary : wiredSummary = ""
Dim tagKey, tagState
For Each tagKey In Array("system-a", "system-b", "ui", "taskbar", "window", "startmenu")
    If combinedOk.Item(tagKey) Then
        tagState = "kombinerad"
    Else
        tagState = "original"
    End If
    wiredSummary = wiredSummary & tagKey & ": " & tagState & vbCrLf
Next

MsgBox "combine.vbs klar. dist\index.html genererad - vad den laddar:" & vbCrLf & vbCrLf & wiredSummary & vbCrLf & "(Program-buntarna finns i dist\program\...\ men aer INTE inkopplade - setup.js rors aldrig.)" & vbCrLf & vbCrLf & "Se dist-mappen: " & distPath, 64, "combine.vbs"
