!macro customInstall
  WriteRegStr HKCU "Software\Classes\bilistudio" "" "URL:Bili Studio Protocol"
  WriteRegStr HKCU "Software\Classes\bilistudio" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\bilistudio\DefaultIcon" "" '$INSTDIR\Bili Studio.exe,0'
  WriteRegStr HKCU "Software\Classes\bilistudio\shell\open\command" "" '"$INSTDIR\Bili Studio.exe" "--" "%1"'
!macroend

!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Classes\bilistudio\shell\open\command" ""
  StrCmp $0 '"$INSTDIR\Bili Studio.exe" "--" "%1"' 0 +2
  DeleteRegKey HKCU "Software\Classes\bilistudio"
!macroend
