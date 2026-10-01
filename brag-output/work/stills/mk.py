import glob,subprocess,os
fs=sorted(glob.glob('t_*.jpg'))
for n in range(0,len(fs),12):
    g=fs[n:n+12]
    open('l.txt','w').write(''.join(f"file '{f}'\nduration 1\n" for f in g))
    subprocess.run(['ffmpeg','-v','error','-y','-f','concat','-i','l.txt','-vf','scale=640:-1,tile=4x3:padding=4','-frames:v','1','-q:v','3',f'sheet_{n//12}.jpg'])
    print(n//12,[f[2:7] for f in g])
