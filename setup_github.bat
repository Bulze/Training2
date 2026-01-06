@echo off
setlocal enabledelayedexpansion

set GIT_NAME=Ognjen Markovic
set GIT_EMAIL=ognjenmarkovic014@gmail.com

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: git is not installed or not in PATH.
  echo Install Git from https://git-scm.com/downloads and retry.
  exit /b 1
)

if not exist ".gitignore" (
  echo node_modules> .gitignore
  echo dist>> .gitignore
  echo local-db.json>> .gitignore
  echo local.db>> .gitignore
  echo .env.local>> .gitignore
)

if not exist ".git" (
  git init
)

git config --global user.name "%GIT_NAME%"
git config --global user.email "%GIT_EMAIL%"

git add .
git commit -m "init"

git branch -M main

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin https://github.com/Bulze/Training2.git
) else (
  git remote set-url origin https://github.com/Bulze/Training2.git
)

git push -u origin main

echo Done.
pause
