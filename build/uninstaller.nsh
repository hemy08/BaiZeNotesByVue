!macro customUnInstall
  ; 卸载时询问用户是否保留配置文件
  MessageBox MB_YESNO "是否保留用户配置文件？$\n$\n配置文件位置：$PROFILE\.baizenotes$\n$\n选择「是」保留配置文件$\n选择「否」删除配置文件" IDYES KeepConfig IDNO DeleteConfig

DeleteConfig:
  ; 删除用户配置目录
  RMDir /r "$PROFILE\.baizenotes"
  Goto Done

KeepConfig:
  ; 保留配置文件，不做任何操作
  Goto Done

Done:
!macroend
