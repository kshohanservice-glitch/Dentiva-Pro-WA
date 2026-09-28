!include "MUI2.nsh"

!macro customUnInit
  ; Data-retention policy on uninstall: never delete user data silently.
  MessageBox MB_YESNO|MB_ICONEXCLAMATION \
    "Dentiva Pro user data (patients, invoices, backups) is stored in:$\r$\n$APPDATA\Dentiva Pro$\r$\n$\r$\nDo you want to DELETE this data during uninstallation?" \
    IDNO dentiva_keep_data
  MessageBox MB_YESNO|MB_ICONSTOP \
    "WARNING: This will PERMANENTLY remove ALL patient and financial records. There is no way to recover them afterwards. Continue?" \
    IDNO dentiva_keep_data
  RMDir /r "$APPDATA\Dentiva Pro"
  Goto dentiva_data_done
dentiva_keep_data:
dentiva_data_done:
!macroend
