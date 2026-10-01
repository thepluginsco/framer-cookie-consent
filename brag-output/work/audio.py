# Synthesises the whole soundtrack (music + SFX in one mix) -> audio.wav
import numpy as np, wave
SR=44100; D=20.0; N=int(SR*D)
rng=np.random.default_rng(7)
L=np.zeros(N+SR*3); R=np.zeros(N+SR*3)       # dry bus
WL=np.zeros_like(L); WR=np.zeros_like(R)     # reverb send
f=lambda m:440*2**((m-69)/12)
def add(sig,t,amp=1,pan=0,wet=.25):
    i=int(t*SR); n=len(sig)
    if i<0 or i+n>len(L): n=min(n,len(L)-i)
    l=np.cos((pan+1)*np.pi/4); r=np.sin((pan+1)*np.pi/4)
    L[i:i+n]+=sig[:n]*amp*l; R[i:i+n]+=sig[:n]*amp*r
    WL[i:i+n]+=sig[:n]*amp*l*wet; WR[i:i+n]+=sig[:n]*amp*r*wet
def tt(d): return np.arange(int(d*SR))/SR
def lp(x,fc,order=2):
    X=np.fft.rfft(x); fr=np.fft.rfftfreq(len(x),1/SR); return np.fft.irfft(X/(1+(fr/fc)**(2*order))**.5,len(x))
def hp(x,fc): return x-lp(x,fc)
def pluck(m,d=.5,bright=1.0):
    t=tt(d); w=2*np.pi*f(m)*t
    s=np.sin(w)+.45*bright*np.sin(2*w)*np.exp(-t*9)+.2*bright*np.sin(3*w)*np.exp(-t*14)
    return s*np.exp(-t*(7/d*.5+3))*np.minimum(1,t/.004)
def bell(m,d=1.2):
    t=tt(d); w=2*np.pi*f(m)*t
    s=np.sin(w)+.35*np.sin(2.76*w)*np.exp(-t*6)+.15*np.sin(5.4*w)*np.exp(-t*12)
    return s*np.exp(-t*4.2)*np.minimum(1,t/.003)
def pop(m,d=.16):
    t=tt(d); fr=f(m)*(1+.6*np.exp(-t*60)); ph=2*np.pi*np.cumsum(fr)/SR
    return np.sin(ph)*np.exp(-t*26)*np.minimum(1,t/.002)
def kick():
    t=tt(.32); fr=46+90*np.exp(-t*34); ph=2*np.pi*np.cumsum(fr)/SR
    return np.sin(ph)*np.exp(-t*11)*np.minimum(1,t/.002)
def hat(d=.05):
    t=tt(d); return hp(rng.standard_normal(len(t)),7000)*np.exp(-t*90)
def snap():
    t=tt(.14); return lp(hp(rng.standard_normal(len(t)),1500),6000)*np.exp(-t*38)
def whoosh(d,up=True,fc=2600):
    t=tt(d); x=t/d; n=lp(rng.standard_normal(len(t)),fc)
    env=(x**2.2 if up else (1-x)**1.6*np.minimum(1,x/.08))
    if up: env=env*np.minimum(1,(1-x)/.06)
    sw=np.sin(2*np.pi*np.cumsum(lerp(180,720,x) if up else lerp(600,160,x))/SR)*.25
    return (n*.9+sw)*env
def lerp(a,b,k): return a+(b-a)*k
def pad(notes,d,fc=1400,att=.4,rel=.6):
    t=tt(d+rel); s=np.zeros(len(t))
    for m in notes:
        for det in (-.07,0,.07):
            w=2*np.pi*f(m+det)*t; s+=sum(np.sin(k*w)/k for k in (1,2,3,4,5))
    env=np.minimum(1,t/att)*np.where(t<d,1,np.exp(-(t-d)*5/rel))
    return lp(s,fc)*env/len(notes)/3
def click():
    t=tt(.05); return (hp(rng.standard_normal(len(t)),2500)*np.exp(-t*160)*.7+np.sin(2*np.pi*150*t)*np.exp(-t*70))

# ---- hook 0-3: sparse pops over an uneasy pad
add(pad([57,60,64],3.0,900,att=.8),0,.20,wet=.5)
PT=[.15,.45,.70,.95,1.15,1.35,1.52,1.70,1.90,2.10]; PM=[69,72,74,76,79,76,81,84,79,88]
for i,(t,m) in enumerate(zip(PT,PM)):
    add(pop(m-12),t,.20,pan=(-.5,.5,-.2,.6,-.6,.4,-.1,-.5,.5,0)[i]); add(pluck(m,.5,.6),t,.09,pan=(i%3-1)*.4,wet=.6)
for b in np.arange(1.0,2.5,.25): add(hat(.03),b,.035,pan=.3)
add(whoosh(.55),2.45,.20,wet=.4)
# ---- 3-5.5: the line, building
add(pad([53,57,60,64],1.25,1300),3.0,.20,wet=.5); add(pad([55,59,62,67],1.25,1900),4.25,.22,wet=.5)
for t,m in [(3.02,72),(3.14,76),(3.26,79),(4.10,74),(4.30,83)]: add(pluck(m,.6),t,.13,wet=.6)
add(pluck(48,.8,.3),3.0,.25); add(pluck(43,.8,.3),4.25,.25)
add(whoosh(1.1,True,5000),4.4,.16,wet=.5)
for b in np.arange(4.5,5.5,.125): add(hat(.03),b,.02+.05*(b-4.5),pan=-.2)
# ---- 5.5 logo hit
add(kick(),5.5,.55); add(pad([48,60,64,67,74],.9,3200,att=.01,rel=.5),5.5,.26,wet=.6)
add(pop(72),5.5,.22); 
for i in range(10): add(pluck(84+[0,2,4,7,9,12,7,9,12,16][i],.3,.4),5.86+i*.032,.05,pan=-.4+i*.09,wet=.7)
add(whoosh(.5),6.05,.15,wet=.4)
# ---- 6.5-16.5 groove: C | Am | F | G | Am F
BARS=[(6.5,2,[48,[60,64,67,74]]),(8.5,2,[45,[57,60,64,71]]),(10.5,2,[41,[53,57,60,67]]),(12.5,2,[43,[55,59,62,69]]),(14.5,1,[45,[57,60,64,72]]),(15.5,1,[41,[53,57,60,69]])]
duck=np.ones(len(L))
for b in np.arange(6.5,16.5,.5):
    add(kick(),b,.50,wet=0)
    i=int(b*SR); n=int(.22*SR); duck[i:i+n]=np.minimum(duck[i:i+n],.35+.65*(np.arange(n)/n)**1.5)
    add(hat(),b+.25,.07,pan=.25); 
    if b>=8.5: add(hat(.03),b+.125,.03,pan=-.3); add(hat(.03),b+.375,.03,pan=-.3)
for b in np.arange(7.0,16.5,1.0): add(snap(),b,.11,pan=-.1,wet=.5)
PL=np.zeros(len(L)); PR=np.zeros(len(L))
for t0,d,(root,ch) in BARS:
    s=pad(ch,d,2200,att=.05,rel=.3); i=int(t0*SR); PL[i:i+len(s)]+=s*.19; PR[i:i+len(s)]+=s*.19
    for k,b in enumerate(np.arange(t0,t0+d,.25)):
        if k%2==1 or k%8==0:
            t=tt(.22); bs=(np.sin(2*np.pi*f(root)*t)+.3*np.sin(4*np.pi*f(root)*t))*np.exp(-t*9)*np.minimum(1,t/.005)
            i=int(b*SR); PL[i:i+len(bs)]+=bs*.26; PR[i:i+len(bs)]+=bs*.26
        m=ch[[0,2,1,3,2,3,1,2][k%8]]+12
        add(pluck(m,.35,.8),b,.065,pan=.5*np.sin(k*1.3),wet=.8)
L+=PL*duck; R+=PR*duck; WL+=PL*duck*.3; WR+=PR*duck*.3
# ---- SFX on picture
add(whoosh(.6,False),6.4,.2,wet=.5)
for i in range(6): add(pop(72+[0,4,7,12,7,16][i]),6.85+i*.09,.13,pan=(-.6,.6,-.4,.5,-.7,.7)[i])
add(whoosh(.45),8.15,.2,wet=.4)
add(whoosh(.4,False,1800),8.55,.12); add(whoosh(.35,False,1500),9.5,.09)
for i in range(3): add(pop(64+i*3),9.3+i*.13,.07,pan=.5)
add(click(),11.1,.5,pan=-.2,wet=.1)
add(whoosh(.3,False,1500),11.3,.08)
for i,m in enumerate([81,84,89]): add(bell(m),[11.6,11.85,12.1][i],.2,pan=.35,wet=.8); add(pop(m-24),[11.6,11.85,12.1][i],.1,pan=.35)
for i in range(4): add(pluck(91+i,.15,.3),12.2+i*.08,.05,pan=.4)
add(bell(86,.9),12.6,.13,pan=-.3,wet=.8); add(bell(91,.9),12.72,.13,pan=-.3,wet=.8)
add(whoosh(.45),13.15,.18,wet=.4)
for t,m in [(14.45,76),(15.15,81),(15.85,84)]: add(pop(m-12),t,.2,pan=-.2); add(bell(m,.7),t,.1,pan=.3,wet=.8)
add(whoosh(.45),16.25,.2,wet=.4)
# ---- outro: C ring-out
add(kick(),16.5,.5); add(pad([48,55,60,64,67,74],2.2,2600,att=.02,rel=1.6),16.5,.24,wet=.7)
add(pop(72),16.7,.2)
for i in range(10): add(pluck(84+[0,2,4,7,9,12,7,9,12,16][i],.3,.4),17.02+i*.032,.05,pan=-.4+i*.09,wet=.7)
for i,m in enumerate([72,76,79,84,88,91,96]): add(pluck(m,.9,.5),17.5+i*.09,.08,pan=-.5+i*.16,wet=.9)
add(bell(84,1.6),18.3,.10,wet=.9); add(pop(67),19.0,.10); add(bell(96,1.5),19.25,.06,wet=.9)
# ---- reverb + master
ir_t=tt(1.6); 
def rev(x,seed):
    ir=np.random.default_rng(seed).standard_normal(len(ir_t))*np.exp(-ir_t*4.2); ir=lp(ir,5000); ir[:int(.012*SR)]=0
    n=len(x)+len(ir); return np.fft.irfft(np.fft.rfft(x,n)*np.fft.rfft(ir,n),n)[:len(x)]*.02
L+=rev(WL,1); R+=rev(WR,2)
mix=np.stack([L[:N],R[:N]],1)
mix=hp(mix[:,0],28),hp(mix[:,1],28); mix=np.stack(mix,1)
mix=np.tanh(mix*1.5)/np.tanh(1.5)
fo=int(1.2*SR); mix[-fo:]*=np.linspace(1,0,fo)[:,None]**1.5
mix*=10**(-1.5/20)/np.abs(mix).max()
print('peak',np.abs(mix).max(),'rms dB',20*np.log10(np.sqrt((mix**2).mean())))
with wave.open('audio.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix*32767).astype('<i2').tobytes())
