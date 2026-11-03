"""skill_tree.json を作る: 公式ツール(rotool.gungho.jp)のスキルツリー21系統から、{系統: {jobs:[職業名], skills:{スキル名: ID名}}}。
  python tools/make_skill_tree.py skill_tree.json   (1.5秒あけて21ページ取る。新職・新スキルが出たら作り直す)"""
import re,json,time,urllib.request,html,sys
B="https://rotool.gungho.jp/character_skill_tree/"
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"Mozilla/5.0"}),timeout=30).read().decode("utf-8")
idx=get(B)
fams={}
for m in re.finditer(r'href="[^"]*character_skill_tree/([A-Z_]+)"[^>]*>(.*?)</a>',idx,re.S):
    t=re.sub(r'<[^>]+>',' ',m.group(2)); t=html.unescape(' '.join(t.split()))
    fams[m.group(1)]=t.split(' ')
out={}
for f,jobs in fams.items():
    time.sleep(1.5)
    p=get(B+f); sk={}
    for m in re.finditer(r'id="([A-Z0-9_]+)">\s*<p class="skill-name[^"]*">(.*?)</p>',p,re.S):
        sk[html.unescape(m.group(2).strip())]=m.group(1)
    out[f]={"jobs":jobs,"skills":sk}; print(f,len(jobs),len(sk),file=sys.stderr)
json.dump(out,open(sys.argv[1],"w",encoding="utf-8"),ensure_ascii=False,separators=(",",":"))
