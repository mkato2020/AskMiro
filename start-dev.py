#!/usr/bin/env python3
import os, subprocess
os.chdir('/Users/mike/Downloads/AskMiro-main')
subprocess.run(
    ['/opt/anaconda3/bin/npx', 'netlify', 'dev', '--port', '8888'],
    cwd='/Users/mike/Downloads/AskMiro-main'
)
