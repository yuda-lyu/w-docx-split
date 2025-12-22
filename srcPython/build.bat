
pyinstaller -F splitDocx.py
pause

pyinstaller build.spec
pause

pyinstaller splitDocx.py
pause
