import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { disposeObject, prefersStill } from "./scene";
import { FORT_SPIN_MS } from "./wheelTiming";

const wedgeColors = [["#184a3b","#37816d"],["#78481d","#a56c2c"],["#622532","#953e51"],["#223a49","#456677"],["#114b60","#24798e"],["#45304e","#715181"]] as const;
const labels = ["₹100", "₹150", "−₹50", "JAIL CARD", "GO", "SCRATCH"];
const TAU = Math.PI * 2;
const SLOTS = 36;

function surface(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  return { canvas, ctx: canvas.getContext("2d")! };
}
function finishTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

function wheelEnamel() {
  const {canvas, ctx} = surface(1024, 1024);
  const centre = 512;
  ctx.fillStyle = "#332317"; ctx.fillRect(0,0,1024,1024);
  ctx.save();
  ctx.translate(centre,centre);
  const segment = TAU / 6;
  for (const [index, [shade, color]] of wedgeColors.entries()) {
    const angle = -Math.PI/2 + index*segment;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,510,angle-segment/2,angle+segment/2); ctx.closePath();
    const enamel = ctx.createRadialGradient(0,0,40,0,0,510);
    enamel.addColorStop(0,shade); enamel.addColorStop(.6,color); enamel.addColorStop(1,shade);
    ctx.fillStyle = enamel; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = "#d1af6d"; ctx.stroke();
    ctx.save(); ctx.rotate(index*segment);
    ctx.strokeStyle = "#dfc598b7"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0,0,411,-Math.PI/2-.44,-Math.PI/2+.44); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,246,-Math.PI/2-.44,-Math.PI/2+.44); ctx.stroke();
    ctx.font = `800 ${index === 3 || index === 5 ? 53 : 72}px Georgia, serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "#0a1014"; ctx.shadowBlur = 7; ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#f0deb3"; ctx.fillText(labels[index]!,0,-337);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.font = "32px Georgia, serif"; ctx.fillText(index === 5 ? "✦" : "◇",0,-276);
    ctx.restore();
  }
  ctx.strokeStyle = "#a77c44"; ctx.lineWidth = 13;
  ctx.beginPath(); ctx.arc(0,0,491,0,TAU); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = "#fff0c07a";
  for (const radius of [196, 418, 466, 479]) { ctx.beginPath(); ctx.arc(0,0,radius,0,TAU); ctx.stroke(); }
  for (let angle=0; angle<TAU; angle+=Math.PI/72) {
    ctx.save(); ctx.rotate(angle); ctx.beginPath(); ctx.moveTo(0,-431); ctx.lineTo(0,-450);
    ctx.strokeStyle = "#edd2a18a"; ctx.stroke(); ctx.restore();
  }
  ctx.restore();
  return finishTexture(canvas);
}

function walnut() {
  const {canvas,ctx} = surface(512,192);
  const image = ctx.createImageData(canvas.width,canvas.height);
  for (let y=0; y<canvas.height; y++) for (let x=0; x<canvas.width; x++) {
    const bend = Math.sin(x*.021)*3.6 + Math.cos(x*.046+y*.14)*1.8;
    const growth = 4*Math.sin((y+bend)*1.05) + 7*Math.sin((y+bend)*.47) + 12*Math.sin((y+bend)*.105);
    const grain = ((Math.imul(x*y+41, 1597334677)>>>12)%21)-10;
    const i=(y*canvas.width+x)*4;
    image.data[i]=93+growth+grain; image.data[i+1]=51+growth*.69+grain*.5; image.data[i+2]=30+growth*.38; image.data[i+3]=255;
  }
  ctx.putImageData(image,0,0);
  return finishTexture(canvas);
}

function makeMachine(scene: THREE.Object3D) {
  const brass = new THREE.MeshStandardMaterial({ color: 0xd9a757, metalness:.76, roughness:.3 });
  const brassDark = new THREE.MeshStandardMaterial({ color: 0x7b502e, metalness:.67, roughness:.38 });
  const iron = new THREE.MeshStandardMaterial({ color:0x172b2c, metalness:.48, roughness:.36 });
  const wood = new THREE.MeshStandardMaterial({ map:walnut(), roughness:.5 });
  const mesh = (geometry: THREE.BufferGeometry, material:THREE.Material, parent: THREE.Object3D, x=0,y=0,z=0) => {
    const item = new THREE.Mesh(geometry,material);
    item.position.set(x,y,z); parent.add(item); return item;
  };
  const block = (w:number,h:number,d:number,r:number) => new RoundedBoxGeometry(w,h,d,2,r);
  const axis = (outer:number, inner:number, depth:number) => {
    const cylinder = new THREE.CylinderGeometry(outer,inner,depth,64);
    cylinder.rotateX(Math.PI/2); return cylinder;
  };

  const stand = new THREE.Group(); scene.add(stand);
  mesh(block(1.57,.21,.77,.055),wood,stand,0,.12,.01);
  mesh(block(1.37,.058,.66,.019),brassDark,stand,0,.25,.01);
  mesh(block(.61,.31,.42,.045),iron,stand,0,.42,-.065);
  for (const x of [-.32,.32]) {
    const upright = mesh(block(.12,1.09,.2,.025),iron,stand,x,.78,-.145);
    upright.rotation.z=x>0?.18:-.18;
    mesh(new THREE.SphereGeometry(.053,10,7),brass,stand,x*1.75,.25,.26);
  }

  const assembly = new THREE.Group();
  assembly.position.set(0,1.35,-.067);
  assembly.rotation.set(-.045,-.235,.01);
  stand.add(assembly);
  const disc = new THREE.Group(); assembly.add(disc);
  mesh(axis(1.03,.98,.17),brassDark,disc);
  mesh(axis(1.018,1.04,.072),brass,disc,0,0,.08);
  mesh(new THREE.CircleGeometry(.975,64),new THREE.MeshStandardMaterial({
    map:wheelEnamel(), metalness:.2, roughness:.45
  }), disc,0,0,.118);
  mesh(new THREE.TorusGeometry(.966,.011,8,64),brassDark,disc,0,0,.124);
  mesh(new THREE.TorusGeometry(1.001,.017,8,64),brass,disc,0,0,.12);

  const pins = new THREE.InstancedMesh(new THREE.SphereGeometry(.022,8,6), brass, SLOTS);
  const matrix = new THREE.Matrix4();
  for (let i=0;i<SLOTS;i++) {
    const angle = i*TAU/SLOTS;
    matrix.makeTranslation(Math.sin(angle)*.957,Math.cos(angle)*.957,.149);
    pins.setMatrixAt(i,matrix);
  }
  disc.add(pins);
  mesh(axis(.169,.17,.063),brassDark,assembly,0,0,.126);
  mesh(axis(.124,.15,.07),brass,assembly,0,0,.167);
  mesh(new THREE.SphereGeometry(.055,14,9),brass,assembly,0,0,.218);

  const pawl = new THREE.Group(); pawl.position.set(0,1.122,.204); assembly.add(pawl);
  mesh(axis(.057,.057,.21),iron,assembly,0,1.122,.101);
  const shape = new THREE.Shape();
  shape.moveTo(-.049,.049); shape.lineTo(.045,.035); shape.lineTo(.031,-.074);
  shape.lineTo(-.011,-.179); shape.lineTo(-.058,-.059); shape.closePath();
  const pointer = mesh(new THREE.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:true,bevelSize:.011,bevelThickness:.009,bevelSegments:2}),brass,pawl);
  pointer.rotation.z=-.1;
  mesh(axis(.035,.036,.041),brassDark,pawl,0,.022,.036);
  return {disc,pawl,pins};
}

function makeGround(scene: THREE.Scene) {
  const {canvas,ctx}=surface(128,128);
  const shadow=ctx.createRadialGradient(64,64,11,64,64,64);
  shadow.addColorStop(0,"rgba(0,7,9,.72)"); shadow.addColorStop(.45,"rgba(0,8,9,.44)");
  shadow.addColorStop(1,"rgba(0,8,9,0)");
  ctx.fillStyle=shadow; ctx.fillRect(0,0,128,128);
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(3.44,1.7),new THREE.MeshBasicMaterial({map:finishTexture(canvas),transparent:true,depthWrite:false}));
  plane.rotation.x=-Math.PI/2; plane.position.set(.04,.006,.13); scene.add(plane);
}

export default function FortWheelCloseup({ section, onReady, onTick }: { section?:number; onReady:(ready:boolean)=>void; onTick:()=>void }) {
  const host = useRef<HTMLDivElement>(null);
  const setTarget = useRef<(section?:number)=>void>(()=>{});
  const currentSection=useRef(section); currentSection.current=section;
  const notify=useRef(onReady); notify.current=onReady;
  const tick=useRef(onTick); tick.current=onTick;
  useEffect(()=>{
    const element=host.current!;
    let renderer:THREE.WebGLRenderer;
    try {
      renderer=new THREE.WebGLRenderer({ alpha:true, antialias:true, powerPreference:"low-power" });
    } catch { return; }
    renderer.setClearColor(0x173739,0);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1,1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.15;
    const scene=new THREE.Scene();
    const stage=new THREE.Group();
    scene.add(stage);
    stage.rotation.y=-.065;
    const key=new THREE.DirectionalLight(0xffe4b6,2.85);
    key.position.set(-3,4,4); scene.add(key);
    const rim=new THREE.DirectionalLight(0xf2d29b,1.85);
    rim.position.set(4,2,-2); scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xd3eeed,0x644923,1.16));
    const env=new RoomEnvironment();
    const pmrem=new THREE.PMREMGenerator(renderer);
    const reflections=pmrem.fromScene(env,.065);
    scene.environment=reflections.texture; scene.environmentIntensity=.57;
    pmrem.dispose(); env.dispose();
    const {disc,pawl,pins}=makeMachine(stage);
    makeGround(scene);
    const camera=new THREE.OrthographicCamera(-1.4,1.4,1.4,-1.4,.05,30);
    camera.position.set(0,2.55,5.35);
    camera.lookAt(0,1.27,0);
    element.append(renderer.domElement);

    let previous = currentSection.current, raf=0, ready=false, lost=false;
    let lastPin=-1,lastClick=0;
    const initialAngle=(face?:number)=>face===undefined?0:TAU*4+face*TAU/6;
    let from=initialAngle(previous), destination=from;
    let began=0;
    disc.rotation.z=destination;
    function render() { if (!lost) renderer.render(scene,camera); }
    function resize() {
      const width=element.clientWidth,height=element.clientHeight;
      if(width<1||height<1||lost)return;
      const aspect=width/height;
      camera.left=-Math.max(1,aspect)*1.47; camera.right=-camera.left;
      camera.top=Math.max(1,1/aspect)*1.47; camera.bottom=-camera.top;
      camera.updateProjectionMatrix(); renderer.setSize(width,height,false);
      render();
      if(!ready){ready=true;element.dataset.rendered="true";notify.current(true);}
    }
    const observer=new ResizeObserver(resize);
    observer.observe(element);
    const loss=(event:Event)=>{event.preventDefault(); lost=true; cancelAnimationFrame(raf); notify.current(false);};
    renderer.domElement.addEventListener("webglcontextlost",loss);
    const still=prefersStill();
    const animate=(time:number)=>{
      const progress=Math.min(1,Math.max(0,(time-began)/FORT_SPIN_MS));
      const eased=1-(1-progress)**3.05;
      const angle=from+(destination-from)*eased;
      const pinTurns=angle/TAU*SLOTS, pin=Math.floor(pinTurns);
      const fraction=pinTurns-pin;
      disc.rotation.z=angle;
      pawl.rotation.z=Math.sin(fraction*Math.PI)*.23*Math.min(1,(1-progress)*6);
      if (pin!==lastPin && time-lastClick>46 && progress<.997) { tick.current(); lastClick=time; lastPin=pin; }
      render();
      if(progress<1)raf=requestAnimationFrame(animate);
    };
    setTarget.current=(face)=>{
      if(lost||face===previous)return;
      previous=face; cancelAnimationFrame(raf); from=disc.rotation.z;
      destination=initialAngle(face); began=performance.now();
      if(still||face===undefined){disc.rotation.z=destination; render();}
      else raf=requestAnimationFrame(animate);
    };
    resize();
    return ()=>{
      setTarget.current=()=>{};
      observer.disconnect(); cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("webglcontextlost",loss);
      disposeObject(scene); pins.dispose(); reflections.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  },[]);
  useEffect(()=>setTarget.current(section),[section]);
  return <div className="wheel-live-render" ref={host} aria-hidden="true" />;
}
