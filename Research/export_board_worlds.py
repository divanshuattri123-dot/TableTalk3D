"""Recover assembled native worlds; independent OBJ files lose batch ranges and placement."""
from pathlib import Path
import json,re,struct,hashlib,gc
import numpy as np
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler
UnityPy.config.FALLBACK_UNITY_VERSION='6000.0.49f1'
ROOT=Path(__file__).resolve().parents[1];SOURCE=ROOT/'tmp/maps-native';OUT=ROOT/'tmp/world-import'
OUT.mkdir(parents=True,exist_ok=True)
manifest=[]
for theme in range(1,11):
    env=UnityPy.load(str(SOURCE/f'level{theme+4}'))
    objects=list(env.objects);names={};transforms={};filters={};renderers={}
    for obj in objects:
        if obj.type.name not in ('GameObject','Transform','MeshFilter','MeshRenderer'):continue
        item=obj.read()
        if obj.type.name=='GameObject':names[obj.path_id]=item.m_Name
        elif obj.type.name=='Transform':transforms[obj.path_id]=item
        elif obj.type.name=='MeshFilter':filters[item.m_GameObject.path_id]=item.m_Mesh
        else:renderers[item.m_GameObject.path_id]=item
    by_go={t.m_GameObject.path_id:key for key,t in transforms.items()};matrices={};meshes={};textures={};parts=[]
    def matrix(key):
        if not key or key not in transforms:return np.eye(4)
        if key in matrices:return matrices[key]
        t=transforms[key];x,y,z,w=[getattr(t.m_LocalRotation,a) for a in 'xyzw']
        m=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),t.m_LocalPosition.x],
          [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),t.m_LocalPosition.y],
          [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),t.m_LocalPosition.z],[0,0,0,1]],dtype=float)
        m[:3,:3]*=np.array([getattr(t.m_LocalScale,a) for a in 'xyz']);matrices[key]=matrix(t.m_Father.path_id)@m
        return matrices[key]
    def material(pointer):
        m=pointer.read();props=m.m_SavedProperties
        if re.search(r'wisps|waves|shadowproxy',m.m_Name,re.I):return None
        colors=dict(props.m_Colors);tint=colors.get('_Color',colors.get('_BaseColor'))
        rgba=[getattr(tint,c) for c in 'rgba'] if tint else [1,1,1,1]
        texenv=dict(props.m_TexEnvs)
        tex=next((texenv[k] for k in ('_MainTex','_BaseMap','_MainTex2','_MainTex3','_MainTex4','_TextureSample4','_TextureSample0') if k in texenv and texenv[k].m_Texture.path_id),None)
        filename=''
        if tex and tex.m_Texture.path_id:
            texture=tex.m_Texture.read();key=texture.object_reader.assets_file.name+str(texture.object_reader.path_id)
            if key not in textures:
                image=texture.image;image.thumbnail((1024,1024));filename=f'theme{theme:03}-{hashlib.sha256(key.encode()).hexdigest()[:10]}.png'
                image.save(OUT/filename);textures[key]=filename
            filename=textures[key]
        elif '_MainColor' in colors or '_MainColour' in colors:
            tint=colors.get('_MainColor',colors.get('_MainColour'));rgba=[getattr(tint,c) for c in 'rgb']+[1]
        return filename,rgba
    for go,renderer in renderers.items():
        name=names.get(go,'')
        if not (name.startswith(f'Combined_Theme{theme:03}_') or name.startswith(f't{theme:02}_')):continue
        if re.search(r'board|tile|shadow_proxy|unseen',name,re.I) or go not in filters:continue
        ref=filters[go];key=(ref.file_id,ref.path_id)
        if not ref.path_id:continue
        if key not in meshes:
            handler=MeshHandler(ref.read());handler.process();meshes[key]=handler
        handler=meshes[key];groups=handler.get_triangles();batch=renderer.m_StaticBatchInfo
        indexed=list(enumerate(groups))
        if batch.subMeshCount:indexed=indexed[batch.firstSubMesh:batch.firstSubMesh+batch.subMeshCount]
        world=np.eye(4) if batch.subMeshCount else matrix(by_go.get(go))
        vertices=np.array(handler.m_Vertices,dtype=float)
        vertices=(world@np.column_stack((vertices,np.ones(len(vertices)))).T).T[:,:3]/9.1
        normals=np.array(handler.m_Normals,dtype=float)[:,:3] if handler.m_Normals else np.tile([0,1,0],(len(vertices),1))
        normals=(np.linalg.inv(world[:3,:3]).T@normals.T).T
        for submesh,faces in indexed:
            indices=np.array(faces,dtype=np.uint32).reshape(-1,3)
            inside=np.max(np.abs(vertices[indices][:,:,[0,2]]),axis=(1,2))<=.49
            indices=indices[inside]
            if not len(indices):continue
            used=np.unique(indices);remap=np.full(len(vertices),-1,dtype=np.int32);remap[used]=np.arange(len(used))
            uv=np.array(handler.m_UV0,dtype=float)[used,:2] if handler.m_UV0 else np.zeros((len(used),2))
            light=np.array(handler.m_UV1,dtype=float)[used,:2] if handler.m_UV1 else uv
            material_index=min(max(0,submesh-(batch.firstSubMesh if batch.subMeshCount else 0)),len(renderer.m_Materials)-1)
            surface=material(renderer.m_Materials[material_index]) if material_index>=0 else ('',[1,1,1,1])
            if surface is None:continue
            texture,tint=surface
            parts.append((name,texture,tint,vertices[used],normals[used],uv,light,remap[indices].reshape(-1)))
    path=OUT/f'theme{theme:03}.bytes'
    with path.open('wb') as f:
        def integer(n):f.write(struct.pack('<I',n))
        def string(s):b=s.encode();integer(len(b));f.write(b)
        integer(0x54545731);integer(len(parts))
        for name,texture,tint,vertices,normals,uv,light,indices in parts:
            string(name);string(texture);f.write(np.array(tint,dtype='<f4').tobytes());integer(len(vertices));integer(len(indices))
            for a in (vertices,normals,uv,light):f.write(np.array(a,dtype='<f4').tobytes())
            f.write(np.array(indices,dtype='<i4').tobytes())
    record={'id':f'theme{theme:03}','parts':len(parts),'triangles':sum(len(p[-1])//3 for p in parts),'bytes':path.stat().st_size,'textures':list(textures.values())}
    assert record['triangles']>1000,record
    manifest.append(record);print(json.dumps(record),flush=True)
    del env,objects,parts,meshes;gc.collect()
(OUT/'worlds.json').write_text(json.dumps(manifest,indent=2))
