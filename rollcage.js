
(function () {
"use strict";

var canvas = document.getElementById("gl");
var gamesMode = !!window.ROLLCAGE_GAMES;
var gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
if (!gl) {
  document.getElementById("fail").style.display = "grid";
  document.getElementById("boot").style.display = "none";
  return;
}

/* ---------------------------------------------------------------- math ---- */
function m4id(o) { o = o || new Float32Array(16); o.set([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); return o; }
function m4mul(a, b, o) {
  o = o || new Float32Array(16);
  var a00=a[0],a01=a[1],a02=a[2],a03=a[3], a10=a[4],a11=a[5],a12=a[6],a13=a[7],
      a20=a[8],a21=a[9],a22=a[10],a23=a[11], a30=a[12],a31=a[13],a32=a[14],a33=a[15];
  for (var i = 0; i < 4; i++) {
    var b0=b[i*4], b1=b[i*4+1], b2=b[i*4+2], b3=b[i*4+3];
    o[i*4]   = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    o[i*4+1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    o[i*4+2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    o[i*4+3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
  }
  return o;
}
function m4trans(x, y, z, o) { o = m4id(o); o[12]=x; o[13]=y; o[14]=z; return o; }
function m4scale(x, y, z, o) { o = m4id(o); o[0]=x; o[5]=y; o[10]=z; return o; }
function m4rotX(a, o) { var c=Math.cos(a), s=Math.sin(a); o=m4id(o); o[5]=c; o[6]=s; o[9]=-s; o[10]=c; return o; }
function m4rotY(a, o) { var c=Math.cos(a), s=Math.sin(a); o=m4id(o); o[0]=c; o[2]=-s; o[8]=s; o[10]=c; return o; }
function m4rotZ(a, o) { var c=Math.cos(a), s=Math.sin(a); o=m4id(o); o[0]=c; o[1]=s; o[4]=-s; o[5]=c; return o; }
function m4persp(fovy, aspect, near, far, o) {
  o = new Float32Array(16);
  var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  o[0]=f/aspect; o[5]=f; o[10]=(far+near)*nf; o[11]=-1; o[14]=2*far*near*nf;
  return o;
}
function m4invert(m, o) {
  o = o || new Float32Array(16);
  var a00=m[0],a01=m[1],a02=m[2],a03=m[3], a10=m[4],a11=m[5],a12=m[6],a13=m[7],
      a20=m[8],a21=m[9],a22=m[10],a23=m[11], a30=m[12],a31=m[13],a32=m[14],a33=m[15];
  var b00=a00*a11-a01*a10, b01=a00*a12-a02*a10, b02=a00*a13-a03*a10,
      b03=a01*a12-a02*a11, b04=a01*a13-a03*a11, b05=a02*a13-a03*a12,
      b06=a20*a31-a21*a30, b07=a20*a32-a22*a30, b08=a20*a33-a23*a30,
      b09=a21*a32-a22*a31, b10=a21*a33-a23*a31, b11=a22*a33-a23*a32;
  var det = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
  if (!det) return m4id(o);
  det = 1 / det;
  o[0]=(a11*b11-a12*b10+a13*b09)*det;  o[1]=(a02*b10-a01*b11-a03*b09)*det;
  o[2]=(a31*b05-a32*b04+a33*b03)*det;  o[3]=(a22*b04-a21*b05-a23*b03)*det;
  o[4]=(a12*b08-a10*b11-a13*b07)*det;  o[5]=(a00*b11-a02*b08+a03*b07)*det;
  o[6]=(a32*b02-a30*b05-a33*b01)*det;  o[7]=(a20*b05-a22*b02+a23*b01)*det;
  o[8]=(a10*b10-a11*b08+a13*b06)*det;  o[9]=(a01*b08-a00*b10-a03*b06)*det;
  o[10]=(a30*b04-a31*b02+a33*b00)*det; o[11]=(a21*b02-a20*b04-a23*b00)*det;
  o[12]=(a11*b07-a10*b09-a12*b06)*det; o[13]=(a00*b09-a01*b07+a02*b06)*det;
  o[14]=(a31*b01-a30*b03-a32*b00)*det; o[15]=(a20*b03-a21*b01+a22*b00)*det;
  return o;
}
/* inverse-transpose of the upper 3x3, so non-uniform box scaling keeps lighting honest */
function m3normal(m, o) {
  o = o || new Float32Array(9);
  var a00=m[0],a01=m[1],a02=m[2], a10=m[4],a11=m[5],a12=m[6], a20=m[8],a21=m[9],a22=m[10];
  var b01=a22*a11-a12*a21, b11=-a22*a10+a12*a20, b21=a21*a10-a11*a20;
  var det = a00*b01 + a01*b11 + a02*b21;
  if (!det) { o.set([1,0,0,0,1,0,0,0,1]); return o; }
  det = 1 / det;
  o[0]=b01*det; o[1]=(-a22*a01+a02*a21)*det; o[2]=(a12*a01-a02*a11)*det;
  o[3]=b11*det; o[4]=(a22*a00-a02*a20)*det;  o[5]=(-a12*a00+a02*a10)*det;
  o[6]=b21*det; o[7]=(-a21*a00+a01*a20)*det; o[8]=(a11*a00-a01*a10)*det;
  return o;
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function damp(a, b, rate, dt) { return lerp(a, b, 1 - Math.exp(-rate * dt)); }

/* -------------------------------------------------------------- shaders ---- */
function compile(type, src) {
  var s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(vs, fs) {
  var p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, "aPos");
  gl.bindAttribLocation(p, 1, "aNormal");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

/* every colour the shaders reach for lives in one of these, so swapping a
   theme is a matter of rewriting them in place — no recompile */
var SKY_TOP = [0.020, 0.028, 0.048];
var SKY_HOR = [0.098, 0.115, 0.155];
var SKY_LOW = [0.012, 0.015, 0.022];
var GLOW = [1.000, 0.460, 0.140];       /* sun disc      */
var GLOW2 = [0.850, 0.350, 0.110];      /* wide halo     */
var BAND = [0.550, 0.300, 0.160];       /* horizon band  */
var SUN_COL = [1.000, 0.720, 0.480];    /* key light     */
var AMB_LO = [0.055, 0.070, 0.105];     /* ambient down  */
var AMB_HI = [0.160, 0.190, 0.250];     /* ambient up    */
var GRID_LINE = [0.165, 0.228, 0.278];  /* fine grid     */
var LIP = [1.000, 0.478, 0.184];        /* coarse grid, ring, ramp lips */

var skyProg = program(
  "#version 300 es\n" +
  "out vec2 vNdc;\n" +
  "void main(){\n" +
  "  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) * 2.0 - 1.0;\n" +
  "  vNdc = p; gl_Position = vec4(p, 1.0, 1.0);\n" +
  "}",
  "#version 300 es\n" +
  "precision highp float;\n" +
  "in vec2 vNdc; out vec4 frag;\n" +
  "uniform mat4 uInvVP; uniform vec3 uCamPos; uniform vec3 uSun;\n" +
  "uniform vec3 uTop, uHor, uLow, uGlow, uGlow2, uBand;\n" +
  "void main(){\n" +
  "  vec4 p = uInvVP * vec4(vNdc, 1.0, 1.0);\n" +
  "  vec3 rd = normalize(p.xyz / p.w - uCamPos);\n" +
  "  float t = rd.y;\n" +
  "  vec3 col = t > 0.0\n" +
  "    ? mix(uHor, uTop, pow(clamp(t,0.0,1.0), 0.55))\n" +
  "    : mix(uHor, uLow, pow(clamp(-t,0.0,1.0), 0.45));\n" +
  "  float s = max(dot(rd, uSun), 0.0);\n" +
  "  col += uGlow * pow(s, 28.0) * 1.1;\n" +
  "  col += uGlow2 * pow(s, 4.0) * 0.09;\n" +
  "  float band = exp(-abs(t) * 42.0) * 0.10;\n" +
  "  col += uBand * band;\n" +
  "  frag = vec4(col, 1.0);\n" +
  "}"
);

var mainProg = program(
  "#version 300 es\n" +
  "in vec3 aPos; in vec3 aNormal;\n" +
  "uniform mat4 uProj, uView, uModel; uniform mat3 uNrm;\n" +
  "out vec3 vN; out vec3 vW;\n" +
  "void main(){\n" +
  "  vec4 w = uModel * vec4(aPos, 1.0);\n" +
  "  vW = w.xyz; vN = uNrm * aNormal;\n" +
  "  gl_Position = uProj * uView * w;\n" +
  "}",
  "#version 300 es\n" +
  "precision highp float;\n" +
  "in vec3 vN; in vec3 vW; out vec4 frag;\n" +
  "uniform vec4 uColor; uniform vec3 uCamPos, uSun; uniform float uEmis; uniform int uMode;\n" +
  "uniform vec3 uGrid, uLip, uAmbLo, uAmbHi, uSunCol, uFog;\n" +
  "float gridLine(vec2 p, float scale, float w){\n" +
  "  vec2 c = p / scale;\n" +
  "  vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);\n" +
  "  return 1.0 - clamp(min(g.x, g.y) - w, 0.0, 1.0);\n" +
  "}\n" +
  "void main(){\n" +
  "  vec3 V = normalize(uCamPos - vW);\n" +
  "  float dist = length(uCamPos - vW);\n" +
  "  vec3 base = uColor.rgb; float alpha = uColor.a;\n" +
  "  if (uMode == 2) { frag = vec4(base, alpha); return; }\n" +
  "  vec3 N = normalize(vN);\n" +
  "  if (uMode == 1) {\n" +
  "    float fine = gridLine(vW.xz, 4.0, 0.6);\n" +
  "    float coarse = gridLine(vW.xz, 32.0, 1.1);\n" +
  "    float fade = clamp(1.0 - dist / 150.0, 0.0, 1.0);\n" +
  "    base = mix(base, uGrid, fine * 0.55 * fade);\n" +
  "    base = mix(base, uLip, coarse * 0.30 * fade);\n" +
  "    float r = length(vW.xz);\n" +
  "    float ring = 1.0 - clamp(abs(r - 92.0) / 1.4, 0.0, 1.0);\n" +
  "    base = mix(base, uLip, ring * 0.55);\n" +
  "  }\n" +
  "  float ndl = dot(N, uSun);\n" +
  "  float diff = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);\n" +
  "  diff *= diff;\n" +
  "  vec3 sky = mix(uAmbLo, uAmbHi, clamp(N.y*0.5+0.5,0.0,1.0));\n" +
  "  vec3 col = base * (sky + uSunCol * diff * 1.05);\n" +
  "  vec3 H = normalize(uSun + V);\n" +
  "  float spec = pow(clamp(dot(N, H), 0.0, 1.0), 46.0) * clamp(ndl, 0.0, 1.0);\n" +
  "  col += mix(uSunCol, vec3(1.0), 0.4) * spec * 0.55;\n" +
  "  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);\n" +
  "  col += mix(uAmbHi, uLip, 0.35) * rim * 0.17;\n" +
  "  col += base * uEmis;\n" +
  "  float fog = 1.0 - exp(-pow(dist / 130.0, 2.1));\n" +
  "  col = mix(col, uFog, clamp(fog, 0.0, 1.0));\n" +
  "  frag = vec4(col, alpha);\n" +
  "}"
);

var U = {
  proj: gl.getUniformLocation(mainProg, "uProj"),
  view: gl.getUniformLocation(mainProg, "uView"),
  model: gl.getUniformLocation(mainProg, "uModel"),
  nrm: gl.getUniformLocation(mainProg, "uNrm"),
  color: gl.getUniformLocation(mainProg, "uColor"),
  cam: gl.getUniformLocation(mainProg, "uCamPos"),
  sun: gl.getUniformLocation(mainProg, "uSun"),
  emis: gl.getUniformLocation(mainProg, "uEmis"),
  mode: gl.getUniformLocation(mainProg, "uMode"),
  grid: gl.getUniformLocation(mainProg, "uGrid"),
  lip: gl.getUniformLocation(mainProg, "uLip"),
  ambLo: gl.getUniformLocation(mainProg, "uAmbLo"),
  ambHi: gl.getUniformLocation(mainProg, "uAmbHi"),
  sunCol: gl.getUniformLocation(mainProg, "uSunCol"),
  fog: gl.getUniformLocation(mainProg, "uFog")
};
var SU = {
  invVP: gl.getUniformLocation(skyProg, "uInvVP"),
  cam: gl.getUniformLocation(skyProg, "uCamPos"),
  sun: gl.getUniformLocation(skyProg, "uSun"),
  top: gl.getUniformLocation(skyProg, "uTop"),
  hor: gl.getUniformLocation(skyProg, "uHor"),
  low: gl.getUniformLocation(skyProg, "uLow"),
  glow: gl.getUniformLocation(skyProg, "uGlow"),
  glow2: gl.getUniformLocation(skyProg, "uGlow2"),
  band: gl.getUniformLocation(skyProg, "uBand")
};

/* ------------------------------------------------------------- geometry ---- */
function mesh(pos, nrm, idx) {
  var vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  var pb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  var nb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, nb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nrm), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  var ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao: vao, count: idx.length };
}

function makeBox() {
  var p = [], n = [], i = [];
  var faces = [
    [[ 1, 1, 1],[ 1, 1,-1],[ 1,-1,-1],[ 1,-1, 1],[ 1, 0, 0]],
    [[-1, 1,-1],[-1, 1, 1],[-1,-1, 1],[-1,-1,-1],[-1, 0, 0]],
    [[-1, 1,-1],[ 1, 1,-1],[ 1, 1, 1],[-1, 1, 1],[ 0, 1, 0]],
    [[-1,-1, 1],[ 1,-1, 1],[ 1,-1,-1],[-1,-1,-1],[ 0,-1, 0]],
    [[-1, 1, 1],[ 1, 1, 1],[ 1,-1, 1],[-1,-1, 1],[ 0, 0, 1]],
    [[ 1, 1,-1],[-1, 1,-1],[-1,-1,-1],[ 1,-1,-1],[ 0, 0,-1]]
  ];
  for (var f = 0; f < 6; f++) {
    var base = p.length / 3, nn = faces[f][4];
    for (var v = 0; v < 4; v++) {
      p.push(faces[f][v][0] * 0.5, faces[f][v][1] * 0.5, faces[f][v][2] * 0.5);
      n.push(nn[0], nn[1], nn[2]);
    }
    i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return mesh(p, n, i);
}

/* cylinder with its axis on X, unit diameter and unit length */
function makeCylinder(seg) {
  var p = [], n = [], i = [];
  var k;
  for (k = 0; k < seg; k++) {
    var a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
    var y0 = Math.cos(a0) * 0.5, z0 = Math.sin(a0) * 0.5;
    var y1 = Math.cos(a1) * 0.5, z1 = Math.sin(a1) * 0.5;
    var b = p.length / 3;
    p.push(-0.5, y0, z0,  0.5, y0, z0,  0.5, y1, z1,  -0.5, y1, z1);
    n.push(0, y0, z0, 0, y0, z0, 0, y1, z1, 0, y1, z1);
    i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  var sides = [[0.5, 1], [-0.5, -1]];
  for (var s = 0; s < 2; s++) {
    var x = sides[s][0], dir = sides[s][1], c = p.length / 3;
    p.push(x, 0, 0); n.push(dir, 0, 0);
    for (k = 0; k <= seg; k++) {
      var a = k / seg * Math.PI * 2;
      p.push(x, Math.cos(a) * 0.5, Math.sin(a) * 0.5); n.push(dir, 0, 0);
    }
    for (k = 0; k < seg; k++) {
      if (dir > 0) i.push(c, c + 1 + k, c + 2 + k);
      else i.push(c, c + 2 + k, c + 1 + k);
    }
  }
  return mesh(p, n, i);
}

/* cone pointing up +Y, unit height, unit base diameter */
function makeCone(seg) {
  var p = [], n = [], i = [], k;
  for (k = 0; k < seg; k++) {
    var a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
    var x0 = Math.cos(a0) * 0.5, z0 = Math.sin(a0) * 0.5;
    var x1 = Math.cos(a1) * 0.5, z1 = Math.sin(a1) * 0.5;
    var b = p.length / 3;
    p.push(0, 0.5, 0, x0, -0.5, z0, x1, -0.5, z1);
    var ny = 0.35;
    n.push(x0 + x1, ny, z0 + z1, x0 * 2, ny, z0 * 2, x1 * 2, ny, z1 * 2);
    i.push(b, b + 1, b + 2);
  }
  var c = p.length / 3;
  p.push(0, -0.5, 0); n.push(0, -1, 0);
  for (k = 0; k <= seg; k++) {
    var a = k / seg * Math.PI * 2;
    p.push(Math.cos(a) * 0.5, -0.5, Math.sin(a) * 0.5); n.push(0, -1, 0);
  }
  for (k = 0; k < seg; k++) i.push(c, c + 2 + k, c + 1 + k);
  return mesh(p, n, i);
}

/* flat quad on XZ, unit size, facing +Y */
function makePlane() {
  return mesh(
    [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5],
    [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    [0, 1, 2, 0, 2, 3]
  );
}

/* ramp wedge: unit width (x), unit length (z), rises from y=0 at z=-0.5 to y=1 at z=+0.5 */
function makeWedge() {
  var p = [], n = [], i = [];
  function quad(a, b, c, d, nx, ny, nz) {
    var base = p.length / 3;
    p.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2], d[0],d[1],d[2]);
    for (var k = 0; k < 4; k++) n.push(nx, ny, nz);
    i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  function tri(a, b, c, nx, ny, nz) {
    var base = p.length / 3;
    p.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2]);
    for (var k = 0; k < 3; k++) n.push(nx, ny, nz);
    i.push(base, base + 1, base + 2);
  }
  var s = 1 / Math.sqrt(2);
  quad([-0.5,0,-0.5], [0.5,0,-0.5], [0.5,1,0.5], [-0.5,1,0.5], 0, s, -s);      /* slope */
  quad([-0.5,1,0.5], [0.5,1,0.5], [0.5,0,0.5], [-0.5,0,0.5], 0, 0, 1);          /* back */
  quad([-0.5,0,0.5], [0.5,0,0.5], [0.5,0,-0.5], [-0.5,0,-0.5], 0, -1, 0);       /* base */
  tri([0.5,0,-0.5], [0.5,0,0.5], [0.5,1,0.5], 1, 0, 0);
  tri([-0.5,0,0.5], [-0.5,0,-0.5], [-0.5,1,0.5], -1, 0, 0);
  return mesh(p, n, i);
}

var MESH = {
  box: makeBox(),
  wheel: makeCylinder(20),
  cone: makeCone(14),
  plane: makePlane(),
  wedge: makeWedge()
};

/* -------------------------------------------------------------- drawing ---- */
var tmpA = new Float32Array(16), tmpB = new Float32Array(16), tmpC = new Float32Array(16);
var nrmTmp = new Float32Array(9);

function draw(m, model, color, mode, emis) {
  gl.uniformMatrix4fv(U.model, false, model);
  gl.uniformMatrix3fv(U.nrm, false, m3normal(model, nrmTmp));
  gl.uniform4fv(U.color, color);
  gl.uniform1i(U.mode, mode || 0);
  gl.uniform1f(U.emis, emis || 0);
  gl.bindVertexArray(m.vao);
  gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
}

/* model = T(pos) * Ry * Rx * Rz * S — the order every posed object here uses */
function pose(px, py, pz, ry, rx, rz, sx, sy, sz, out) {
  var m = m4trans(px, py, pz, out || new Float32Array(16));
  if (ry) m4mul(m, m4rotY(ry, tmpA), m);
  if (rx) m4mul(m, m4rotX(rx, tmpB), m);
  if (rz) m4mul(m, m4rotZ(rz, tmpC), m);
  m4mul(m, m4scale(sx, sy, sz, tmpA), m);
  return m;
}

var C = {
  ground:  [0.043, 0.052, 0.070, 1],
  body:    [0.780, 0.290, 0.080, 1],
  bodyLo:  [0.520, 0.180, 0.050, 1],
  glass:   [0.045, 0.070, 0.105, 1],
  trim:    [0.105, 0.120, 0.145, 1],
  tyre:    [0.055, 0.060, 0.072, 1],
  rim:     [0.620, 0.660, 0.720, 1],
  head:    [1.000, 0.930, 0.780, 1],
  mark:    [1.000, 0.930, 0.780, 1],
  tail:    [1.000, 0.160, 0.090, 1],
  flame:   [1.000, 0.560, 0.180, 1],
  pillar:  [0.072, 0.083, 0.104, 1],
  ramp:    [0.130, 0.145, 0.175, 1],
  rampLip: [1.000, 0.478, 0.184, 1],
  coneA:   [0.900, 0.360, 0.120, 1],
  shadow:  [0.010, 0.012, 0.018, 0.42],
  skid:    [0.020, 0.022, 0.028, 0.34]
};

/* ---------------------------------------------------------------- themes ---- */
/* a theme is a flat table of hex swaps: the HUD half rewrites the CSS custom
   properties, the scene half rewrites the colour arrays the renderer reads
   every frame — so switching costs nothing and needs no reload */
var THEMES = [
  { id: "ember", name: "Ember",
    ui: { ink: "#080A0F", panel: "#0F131A", hair: "#1E242F", text: "#D6DCE6", muted: "#7A8698",
          accent: "#FF7A2F", dim: "#8E4318", kbd: "#151A22", tick: "#333B49", air: "#4B94C9" },
    sky: ["#05070C", "#191D28", "#030406"], glow: ["#FF7524", "#D9591C", "#8C4D29"],
    sun: "#FFB87A", ambLo: "#0E121B", ambHi: "#293040",
    world: { ground: "#0B0D12", grid: "#2A3A47", ramp: "#21252D", lip: "#FF7A2F",
             pillar: "#12151A", cone: "#E65C1F" },
    car: { body: "#C74A14", lo: "#852E0D", glass: "#0B121B", trim: "#1B1F25", tyre: "#0E0F12",
           rim: "#9EA8B8", head: "#FFEDC7", tail: "#FF2917", flame: "#FF8F2E",
           mark: "#FFEDC7" },
    shade: ["#030305", "#050506"] },

  { id: "noir", name: "Noir",
    ui: { ink: "#08080A", panel: "#121215", hair: "#26262B", text: "#EAEAEE", muted: "#85858D",
          accent: "#F5F5F8", dim: "#6C6C74", kbd: "#16161A", tick: "#3C3C43", air: "#A9A9B2" },
    sky: ["#08080A", "#1C1C20", "#040405"], glow: ["#FFFFFF", "#C9C9D0", "#6E6E76"],
    sun: "#FFFFFF", ambLo: "#131317", ambHi: "#37373E",
    world: { ground: "#0C0C0F", grid: "#45454D", ramp: "#1F1F24", lip: "#F5F5F8",
             pillar: "#141417", cone: "#D8D8DE" },
    car: { body: "#E6E6EA", lo: "#9B9BA2", glass: "#0C0C10", trim: "#1C1C21", tyre: "#0D0D10",
           rim: "#B5B5BC", head: "#FFFFFF", tail: "#FF3B30", flame: "#FFFFFF",
           mark: "#101014" },
    shade: ["#000000", "#050506"] },

  { id: "azure", name: "Azure",
    ui: { ink: "#050B15", panel: "#0A1425", hair: "#17293F", text: "#D2E3F4", muted: "#6D8399",
          accent: "#3AA9FF", dim: "#17537F", kbd: "#0C1929", tick: "#27455F", air: "#7FD1E8" },
    sky: ["#030A18", "#11243B", "#02060D"], glow: ["#4FB6FF", "#2A7FC4", "#1E5E8C"],
    sun: "#C6E4FF", ambLo: "#0A1626", ambHi: "#22405E",
    world: { ground: "#060E1A", grid: "#1F4A6B", ramp: "#152538", lip: "#3AA9FF",
             pillar: "#0C1728", cone: "#2E9BE0" },
    car: { body: "#1F6FC4", lo: "#12457C", glass: "#08131F", trim: "#15233A", tyre: "#0B1017",
           rim: "#A6C2DA", head: "#E8F6FF", tail: "#FF4A3D", flame: "#6FC7FF",
           mark: "#E8F6FF" },
    shade: ["#02060C", "#04080E"] },

  { id: "paper", name: "Paper",
    ui: { ink: "#ECE8DE", panel: "#FBF8F1", panelA: ".82", hair: "#CDC5B4", text: "#1D1D1F",
          muted: "#6B6961", accent: "#C4471B", dim: "#E2A183", kbd: "#E5E0D4",
          tick: "#B2AB9B", air: "#3E7FA6" },
    sky: ["#B9CFE4", "#E7DFD0", "#CFC6B6"], glow: ["#FFF4DC", "#FFE6B8", "#EADCC2"],
    sun: "#C8BFAE", ambLo: "#57544D", ambHi: "#6B675E",
    world: { ground: "#DCD6C8", grid: "#A79E8C", ramp: "#C7BFAE", lip: "#C4471B",
             pillar: "#B8AF9D", cone: "#D2551F" },
    car: { body: "#D24E19", lo: "#9C3A12", glass: "#4A5560", trim: "#8A8474", tyre: "#3A3833",
           rim: "#D6D2C8", head: "#FFF6D8", tail: "#E0261A", flame: "#FF9A3C",
           mark: "#FFF6D8" },
    shade: ["#2E2B25", "#3A362E"] },

  { id: "cozy", name: "Cozy",
    ui: { ink: "#16100C", panel: "#211812", hair: "#3A2A20", text: "#EDDCC8", muted: "#A08770",
          accent: "#E8A15C", dim: "#7A4E27", kbd: "#241A13", tick: "#4C382A", air: "#7FA98F" },
    sky: ["#1A1008", "#2E1C10", "#0C0704"], glow: ["#FFC27A", "#E09A52", "#A86A34"],
    sun: "#FFD3A0", ambLo: "#241A12", ambHi: "#48342A",
    world: { ground: "#1A120C", grid: "#4A3527", ramp: "#2C1F16", lip: "#E8A15C",
             pillar: "#1E150E", cone: "#D98A45" },
    car: { body: "#B4622C", lo: "#7A3F1B", glass: "#1A1310", trim: "#2A1E16", tyre: "#12100E",
           rim: "#C7A98A", head: "#FFE9BE", tail: "#E2452C", flame: "#FFB061",
           mark: "#FFE9BE" },
    shade: ["#0A0704", "#0D0906"] },

  { id: "modern", name: "Modern",
    ui: { ink: "#0B0D0E", panel: "#14181A", hair: "#232A2D", text: "#DCE4E6", muted: "#7C8A8E",
          accent: "#38E0B0", dim: "#17705A", kbd: "#171C1E", tick: "#344145", air: "#5CB8E0" },
    sky: ["#070A0B", "#1A2124", "#040506"], glow: ["#9FF3DC", "#4FBFA4", "#2A6E60"],
    sun: "#E8FFF8", ambLo: "#121819", ambHi: "#2C3639",
    world: { ground: "#0C1011", grid: "#2E4448", ramp: "#1E2528", lip: "#38E0B0",
             pillar: "#12181A", cone: "#2FC79C" },
    car: { body: "#D8DEE2", lo: "#8C979B", glass: "#0D1315", trim: "#1B2225", tyre: "#0D0F10",
           rim: "#AFBBBF", head: "#F2FFFC", tail: "#FF4D4D", flame: "#7CF0D2",
           mark: "#10181A" },
    shade: ["#030405", "#060809"] },

  { id: "classic", name: "Classic",
    ui: { ink: "#0A0F0B", panel: "#101710", hair: "#21301F", text: "#E4E0CE", muted: "#8A9382",
          accent: "#C9A227", dim: "#6E5714", kbd: "#141B13", tick: "#38452F", air: "#7FA0A8" },
    sky: ["#08120C", "#1B2A1C", "#040805"], glow: ["#FFE9A8", "#D9B65C", "#8C7434"],
    sun: "#FFF2C8", ambLo: "#101811", ambHi: "#2A3828",
    world: { ground: "#0B120C", grid: "#33452F", ramp: "#1B2419", lip: "#C9A227",
             pillar: "#111A11", cone: "#C08A2A" },
    car: { body: "#1C5C3A", lo: "#123D26", glass: "#0C1410", trim: "#22271C", tyre: "#0E100E",
           rim: "#C7B27A", head: "#FFF3CE", tail: "#C4241C", flame: "#FFD46B",
           mark: "#FFF3CE" },
    shade: ["#030604", "#050806"] },

  { id: "neon", name: "Neon",
    ui: { ink: "#06050C", panel: "#0E0A1A", hair: "#241A3D", text: "#E6DEFF", muted: "#8A7DB3",
          accent: "#FF3DAE", dim: "#7A1B55", kbd: "#120C22", tick: "#3A2A5E", air: "#35E8FF" },
    sky: ["#05040E", "#150A25", "#020106"], glow: ["#FF52B8", "#8A2BE2", "#2AA8D8"],
    sun: "#FFB8E8", ambLo: "#100A20", ambHi: "#2A1B47",
    world: { ground: "#07060F", grid: "#3A2A6B", ramp: "#160F2A", lip: "#FF3DAE",
             pillar: "#0D0A1A", cone: "#B429E8" },
    car: { body: "#7A2BE0", lo: "#4C1690", glass: "#0A0818", trim: "#1A1230", tyre: "#0B0912",
           rim: "#B8A6E8", head: "#B8FBFF", tail: "#FF2D6F", flame: "#35E8FF",
           mark: "#B8FBFF" },
    shade: ["#020105", "#040308"] }
];

function hexBits(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function paint(dst, h) {
  var b = hexBits(h);
  dst[0] = b[0] / 255; dst[1] = b[1] / 255; dst[2] = b[2] / 255;   /* alpha, if any, survives */
  return dst;
}
function triplet(h) { var b = hexBits(h); return b[0] + " " + b[1] + " " + b[2]; }

var themeIx = 0;
function applyTheme(id, remember) {
  var t = null, i;
  for (i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) { t = THEMES[i]; themeIx = i; }
  if (!t) return;
  var u = t.ui, r = document.documentElement.style;
  r.setProperty("--ink", u.ink);         r.setProperty("--ink-rgb", triplet(u.ink));
  r.setProperty("--panel", u.panel);     r.setProperty("--panel-rgb", triplet(u.panel));
  r.setProperty("--panel-a", u.panelA || ".72");
  r.setProperty("--hairline", u.hair);
  r.setProperty("--text", u.text);
  r.setProperty("--muted", u.muted);
  r.setProperty("--accent", u.accent);   r.setProperty("--accent-rgb", triplet(u.accent));
  r.setProperty("--accent-dim", u.dim);
  r.setProperty("--kbd", u.kbd);
  r.setProperty("--tick", u.tick);
  r.setProperty("--air", u.air);

  paint(SKY_TOP, t.sky[0]); paint(SKY_HOR, t.sky[1]); paint(SKY_LOW, t.sky[2]);
  paint(GLOW, t.glow[0]); paint(GLOW2, t.glow[1]); paint(BAND, t.glow[2]);
  paint(SUN_COL, t.sun); paint(AMB_LO, t.ambLo); paint(AMB_HI, t.ambHi);

  var w = t.world, c = t.car;
  paint(C.ground, w.ground); paint(GRID_LINE, w.grid); paint(C.ramp, w.ramp);
  paint(C.rampLip, w.lip);   paint(LIP, w.lip);
  paint(C.pillar, w.pillar); paint(C.coneA, w.cone);
  paint(C.body, c.body); paint(C.bodyLo, c.lo); paint(C.glass, c.glass); paint(C.trim, c.trim);
  paint(C.tyre, c.tyre); paint(C.rim, c.rim); paint(C.head, c.head); paint(C.tail, c.tail);
  paint(C.flame, c.flame); paint(C.mark, c.mark || c.head);
  paint(C.shadow, t.shade[0]); paint(C.skid, t.shade[1]);
  gl.clearColor(SKY_HOR[0], SKY_HOR[1], SKY_HOR[2], 1);

  document.getElementById("themeName").textContent = t.name;
  var sw = document.getElementById("sws").children;
  for (i = 0; i < sw.length; i++) sw[i].classList.toggle("on", i === themeIx);
  if (remember !== false) { try { localStorage.setItem("rollcage.theme", id); } catch (e) {} }
}
function nextTheme() { applyTheme(THEMES[(themeIx + 1) % THEMES.length].id); }

(function buildSwatches() {
  var host = document.getElementById("sws");
  THEMES.forEach(function (t) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "sw"; b.title = t.name;
    b.setAttribute("aria-label", t.name + " theme");
    b.style.setProperty("--a", t.ui.accent);
    b.style.setProperty("--b", t.ui.ink);
    b.addEventListener("click", function () { applyTheme(t.id); });
    host.appendChild(b);
  });
})();

var saved = null;
try { saved = localStorage.getItem("rollcage.theme"); } catch (e) {}
applyTheme(saved || "ember", false);


/* ---------------------------------------------------------------- world ---- */
var seed = 20260812;
function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }

var RAMPS = [];
function addRamp(x, z, yaw, w, len, h) {
  RAMPS.push({ x: x, z: z, yaw: yaw, w: w, len: len, h: h, s: Math.sin(yaw), c: Math.cos(yaw) });
}
addRamp(0, -34, 0, 12, 16, 3.4);
addRamp(28, 12, Math.PI * 0.5, 10, 14, 2.8);
addRamp(-30, 20, Math.PI * -0.35, 11, 18, 4.2);
addRamp(-8, 52, Math.PI, 14, 20, 5.0);
addRamp(46, -30, Math.PI * -0.75, 10, 15, 3.2);

/* ------------------------------------------------------- checkpoint data ----
   Portfolio content from https://alivillain.github.io/My-Gaming-Portfolio/.
   Everything a pad shows lives in this one block:
   x/z is where the pad sits, r is its half-size, dir is the heading you must be
   travelling in to make it open ([0,-1] = up the screen, [-1,0] = left).      */
var ZONES = [
  {
    id: "personal",
    name: "Personal Details",
    hint: "Enter driving UP ▲",
    tag: "Checkpoint 01 · approach from the south",
    x: 0, z: -13, r: 7, dir: [0, -1],
    body:
      '<dl class="facts">' +
        '<dt>Name</dt><dd>Ali Hamza</dd>' +
        '<dt>Birthday</dt><dd>1 February 2001</dd>' +
        '<dt>Role</dt><dd>Unity Developer</dd>' +
        '<dt>Based</dt><dd>Islamabad, Pakistan</dd>' +
        '<dt>Freelance</dt><dd>Available</dd>' +
      '</dl>' +
      '<p class="bio">Unity developer specializing in C# scripting and interactive experiences, including simulations, shooting, open-world, multiplayer, 2D, and AR/VR games.</p>' +
      '<h3>Education</h3><ol class="roles">' +
        '<li><b>Bachelor in Software Engineering</b><span>2018 &mdash; 2022</span><em>University of Sargodha, Sargodha, Pakistan</em></li>' +
        '<li><b>ICS</b><span>2016 &mdash; 2018</span><em>FAZAIA, Sargodha</em></li></ol>' +
      '<h3>Skills</h3><p class="bio">C# &middot; Unity Engine &middot; Multiplayer &middot; AR/VR &middot; WordPress/CMS &middot; .NET Development</p>' +
      '<h3>Contact</h3><dl class="facts">' +
        '<dt>Email</dt><dd><a href="mailto:gtasan533083@gmail.com">gtasan533083@gmail.com</a></dd>' +
        '<dt>Phone</dt><dd><a href="tel:+923091068957">+92 309 1068957</a></dd></dl>' +
      '<p class="bio"><a href="https://www.linkedin.com/in/ali-hamza-b6bb11197/" target="_blank" rel="noopener noreferrer">LinkedIn</a> &middot; ' +
        '<a href="https://www.instagram.com/alihamza.villain/" target="_blank" rel="noopener noreferrer">Instagram</a> &middot; ' +
        '<a href="https://www.facebook.com/profile.php?id=100017211969567" target="_blank" rel="noopener noreferrer">Facebook</a></p>'
  },
  {
    id: "experience",
    name: "Experience",
    hint: "Enter driving LEFT ◀",
    tag: "Checkpoint 02 · approach from the east",
    x: -22, z: 4, r: 7, dir: [-1, 0],
    body:
      '<ol class="roles">' +
        '<li><b>Senior Unity Developer</b><span>KATANA Games · 2023 &mdash; Present</span>' +
          '<em>Lahore, Pakistan. Gameplay and multiplayer programming.</em></li>' +
        '<li><b>Unity Developer</b><span>Waypoint Games · 2022 &mdash; 2023</span>' +
          '<em>Islamabad, Pakistan. Gameplay programming.</em></li>' +
      '</ol>' +
      '<h3>Projects</h3><ol class="roles">' +
        '<li><a href="https://play.google.com/store/apps/details?id=com.cbg.gangstermafiacrime.action.shooting.games" target="_blank" rel="noopener noreferrer">Gangster Open World Game</a></li>' +
        '<li><a href="https://play.google.com/store/apps/details?id=com.ts.homedecor.makeovergames" target="_blank" rel="noopener noreferrer">House Makeover Cleaning Games</a></li>' +
        '<li><a href="https://play.google.com/store/apps/details?id=com.dreamtorisre.OffroadTruckTransport3dGames" target="_blank" rel="noopener noreferrer">Death Road Truck Driving Game</a></li>' +
        '<li><a href="https://play.google.com/store/apps/details?id=com.cbg.virtual.mom.mother.families.life.sim.game" target="_blank" rel="noopener noreferrer">Virtual Mother Family Life Sim</a></li>' +
        '<li><a href="https://play.google.com/store/apps/details?id=com.tank.force.battle3d.tankgames" target="_blank" rel="noopener noreferrer">3D Tank Battle</a></li>' +
        '<li><a href="https://drive.google.com/drive/folders/1zSsl6z_7P43fV98SuziSvJ51Jf9pY6hu" target="_blank" rel="noopener noreferrer">VR Games</a></li>' +
        '<li><a href="https://play.google.com/store/apps/details?id=com.waypoint.games.police.car.drive&amp;hl=en&amp;gl=US" target="_blank" rel="noopener noreferrer">Police Car Driving Simulator</a></li>' +
        '<li><a href="https://play.google.com/store/apps/details?id=com.waypoint.construction.driving.school&amp;hl=en&amp;gl=US" target="_blank" rel="noopener noreferrer">Excavator Construction Game 3d</a></li></ol>' +
      '<h3>Services</h3><p class="bio">Unity game development, mobile and web app development, AR/VR experiences, and .NET development.</p>' +
      '<p class="bio"><a href="https://alivillain.github.io/My-Gaming-Portfolio/" target="_blank" rel="noopener noreferrer">View full portfolio</a></p>'
  }
];

if (gamesMode) { ZONES = window.ROLLCAGE_GAMES; RAMPS.length = 0; }

/* keep scenery out of the pads and their run-ups */
function nearZone(x, z, pad) {
  for (var i = 0; i < ZONES.length; i++) {
    if (Math.hypot(x - ZONES[i].x, z - ZONES[i].z) < ZONES[i].r + pad) return true;
  }
  return false;
}

/* height of the terrain under a world point, plus which ramp owns it */
function groundAt(x, z) {
  var h = 0;
  for (var i = 0; i < RAMPS.length; i++) {
    var r = RAMPS[i];
    var dx = x - r.x, dz = z - r.z;
    var lx = dx * r.c - dz * r.s;
    var lz = dx * r.s + dz * r.c;
    if (Math.abs(lx) > r.w * 0.5 || Math.abs(lz) > r.len * 0.5) continue;
    var t = clamp((lz + r.len * 0.5) / r.len, 0, 1);
    var rh = t * r.h;
    if (rh > h) h = rh;
  }
  return h;
}

/* is this spot inside a ramp footprint, grown by pad? nothing may spawn there */
function nearRamp(x, z, pad) {
  for (var i = 0; i < RAMPS.length; i++) {
    var r = RAMPS[i];
    var dx = x - r.x, dz = z - r.z;
    var lx = dx * r.c - dz * r.s;
    var lz = dx * r.s + dz * r.c;
    if (Math.abs(lx) <= r.w * 0.5 + pad && Math.abs(lz) <= r.len * 0.5 + pad) return true;
  }
  return false;
}

var PROPS = [];
(function buildProps() {
  if (gamesMode) return;
  var i, a, rad, px, pz, tries;
  for (i = 0; i < 26; i++) {
    a = i / 26 * Math.PI * 2 + rnd() * 0.1;
    rad = 96 + rnd() * 16;
    PROPS.push({ kind: "pillar", x: Math.cos(a) * rad, z: Math.sin(a) * rad,
                 h: 6 + rnd() * 14, w: 2 + rnd() * 2.4, yaw: rnd() * 3 });
  }
  /* solid blocks: never on a ramp, its run-up, or the spawn point */
  for (i = 0; i < 9; i++) {
    for (tries = 0; tries < 40; tries++) {
      a = rnd() * Math.PI * 2; rad = 24 + rnd() * 44;
      px = Math.cos(a) * rad; pz = Math.sin(a) * rad;
      if (nearRamp(px, pz, 9)) continue;
      if (nearZone(px, pz, 10)) continue;
      if (Math.hypot(px - 0, pz - 8) < 16) continue;
      PROPS.push({ kind: "block", x: px, z: pz, h: 1.2 + rnd() * 2.6,
                   w: 3 + rnd() * 5, yaw: rnd() * 3.14 });
      break;
    }
  }
  /* cones are pass-through dressing, they only avoid the ramp surfaces themselves */
  for (i = 0; i < 34; i++) {
    a = rnd() * Math.PI * 2; rad = 14 + rnd() * 56;
    px = Math.cos(a) * rad; pz = Math.sin(a) * rad;
    if (nearRamp(px, pz, 1.5)) continue;
    if (nearZone(px, pz, 2)) continue;
    PROPS.push({ kind: "cone", x: px, z: pz, h: 0.9, w: 0.8, yaw: 0 });
  }
})();

/* solid scenery the car has to drive around */
var BLOCKS = PROPS.filter(function (p) { return p.kind === "block"; })
                  .map(function (p) { return { x: p.x, z: p.z, r: p.w * 0.6 }; });

/* --------------------------------------------------------------- the car ---- */
var WHEELBASE = 2.70, TRACK = 1.92, RIDE = 0.44, WHEEL_R = 0.42;

/* yaw 0 points the nose down -Z, which is "up" on the top-down map */
var car = {
  x: 0, y: RIDE, z: gamesMode ? 48 : 8,
  yaw: 0, pitch: 0, roll: 0,
  vf: 0, vr: 0, vy: 0,
  yawRate: 0, pitchVel: 0, rollVel: 0,
  steer: 0, spin: 0,
  grounded: true, climb: 0, air: 0, boost: 1, slip: 0
};
function resetCar() {
  car.x = 0; car.y = RIDE; car.z = gamesMode ? 48 : 8; car.yaw = 0;
  car.pitch = car.roll = 0; car.vf = car.vr = car.vy = 0;
  car.pitchVel = car.rollVel = 0; car.air = 0; car.boost = 1; car.slip = 0;
}

var SKIDS = [], SKID_MAX = 260;

/* --------------------------------------------------------------- camera ---- */
var MODES = ["Top-down", "Chase", "Orbit", "Cinematic"];
var TOPDOWN = 0, CHASE = 1, ORBIT = 2, CINE = 3;
var cam = {
  mode: CINE, yaw: 0, pitch: -0.22, roll: 0, dist: 11,
  targetRoll: 0, userYaw: 0, tx: 0, ty: 1, tz: 8,
  pos: [0, 3, 20]
};

/* switching modes has to hand the rig over cleanly — the top-down view parks
   pitch at straight down, so leaving it needs the old pitch and zoom back */
function setCamMode(m) {
  var prev = cam.mode;
  cam.mode = (m + MODES.length) % MODES.length;
  if (cam.mode === TOPDOWN) { cam.dist = gamesMode ? 72 : 38; cam.targetRoll = 0; }
  else if (prev === TOPDOWN) { cam.dist = 11; cam.pitch = -0.24; }
  if (cam.mode === CHASE) cam.userYaw = wrapAngle(cam.yaw - car.yaw);
}

/* ---------------------------------------------------------------- input ---- */
var keys = Object.create(null);
var started = false;
window.addEventListener("keydown", function (e) {
  if (gamesMode && window.gamePanelOpen) return;
  var k = e.key.toLowerCase();
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].indexOf(k) >= 0) e.preventDefault();
  if (keys[k]) return;
  keys[k] = true;
  if (k === "c") setCamMode(cam.mode + 1);
  if (k === "f") cam.targetRoll = Math.abs(cam.targetRoll) > 1.5 ? 0 : Math.PI;
  if (k === "r") resetCar();
  if (k === "t") nextTheme();
});
window.addEventListener("keyup", function (e) { keys[e.key.toLowerCase()] = false; });
window.addEventListener("blur", function () { keys = Object.create(null); });

/* one pointer orbits the rig, two fingers pinch the zoom */
var drag = null, pts = Object.create(null), nPts = 0, pinch = 0;
function pinchSpan() {
  var ids = Object.keys(pts);
  if (ids.length < 2) return 0;
  var a = pts[ids[0]], b = pts[ids[1]];
  return Math.hypot(a.x - b.x, a.y - b.y);
}
canvas.addEventListener("pointerdown", function (e) {
  pts[e.pointerId] = { x: e.clientX, y: e.clientY }; nPts++;
  canvas.setPointerCapture(e.pointerId);
  if (nPts === 1) {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.classList.add("dragging");
  } else {
    drag = null; canvas.classList.remove("dragging"); pinch = pinchSpan();
  }
});
canvas.addEventListener("pointermove", function (e) {
  if (pts[e.pointerId]) { pts[e.pointerId].x = e.clientX; pts[e.pointerId].y = e.clientY; }
  if (nPts >= 2) {
    var span = pinchSpan();
    if (pinch > 0 && span > 0) cam.dist = clamp(cam.dist * (pinch / span), 3.2, 46);
    pinch = span;
    return;
  }
  if (!drag || e.pointerId !== drag.id) return;
  var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  /* the map view stays locked overhead — dragging it would defeat the point */
  if (cam.mode === TOPDOWN) return;
  /* while the view is rolled past vertical, invert drag so it still feels direct */
  var flip = Math.cos(cam.roll) < 0 ? -1 : 1;
  if (cam.mode === CHASE) cam.userYaw -= dx * 0.006 * flip;
  else cam.yaw -= dx * 0.006 * flip;
  cam.pitch -= dy * 0.006 * flip;     /* no clamp: this is the whole point */
  if (cam.mode === CINE) cam.mode = ORBIT;
});
function endDrag(e) {
  if (pts[e.pointerId]) { delete pts[e.pointerId]; nPts--; }
  if (nPts < 2) pinch = 0;
  if (drag && e.pointerId === drag.id) { drag = null; canvas.classList.remove("dragging"); }
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("wheel", function (e) {
  e.preventDefault();
  cam.dist = clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.09), 3.2, 46);
}, { passive: false });

/* -------------------------------------------------------------- touch ---- */
/* the arrows feed the very same two axes the keyboard drives: on the ground
   they steer and throttle, in the air they are pitch and roll */
var dpad = { up: false, down: false, left: false, right: false };
var vpad = { boost: false, drift: false };

function armTouch() { document.body.classList.add("touch"); }
/* a touchscreen laptop stays on keys until a finger actually lands */
if (matchMedia("(pointer: coarse)").matches) armTouch();
window.addEventListener("touchstart", armTouch, { once: true, passive: true });

/* held buttons latch a flag, tapped ones fire once — same split as the keys */
var held = [];
function holdBtn(id, set) {
  var b = document.getElementById(id), pid = null;
  function up(e) {
    if (e && e.pointerId !== pid) return;
    pid = null; b.classList.remove("down"); set(false);
  }
  b.addEventListener("pointerdown", function (e) {
    pid = e.pointerId; b.setPointerCapture(e.pointerId);
    b.classList.add("down"); set(true); e.preventDefault();
  });
  b.addEventListener("pointerup", up);
  b.addEventListener("pointercancel", up);
  held.push(up);
}
function tapBtn(id, fn) {
  var b = document.getElementById(id);
  b.addEventListener("pointerdown", function (e) { b.classList.add("down"); fn(); e.preventDefault(); });
  function up() { b.classList.remove("down"); }
  b.addEventListener("pointerup", up);
  b.addEventListener("pointercancel", up);
  b.addEventListener("pointerleave", up);
}
holdBtn("btnUp", function (v) { dpad.up = v; });
holdBtn("btnDown", function (v) { dpad.down = v; });
holdBtn("btnLeft", function (v) { dpad.left = v; });
holdBtn("btnRight", function (v) { dpad.right = v; });
holdBtn("btnBoost", function (v) { vpad.boost = v; });
holdBtn("btnDrift", function (v) { vpad.drift = v; });
tapBtn("btnCam", function () { setCamMode(cam.mode + 1); });
tapBtn("btnFlip", function () { cam.targetRoll = Math.abs(cam.targetRoll) > 1.5 ? 0 : Math.PI; });
tapBtn("btnReset", resetCar);

/* losing the window must not leave a button stuck on */
window.addEventListener("blur", function () {
  for (var i = 0; i < held.length; i++) held[i]();
});

/* --------------------------------------------------------------- physics ---- */
function step(dt) {
  var throttle = (keys.w || keys.arrowup || dpad.up ? 1 : 0) - (keys.s || keys.arrowdown || dpad.down ? 1 : 0);
  var turn = (keys.a || keys.arrowleft || dpad.left ? 1 : 0) - (keys.d || keys.arrowright || dpad.right ? 1 : 0);
  var hand = !!keys[" "] || vpad.drift;
  var boosting = (keys.shift || keys.shiftleft || vpad.boost) && car.boost > 0.02 && car.grounded;

  if (boosting) car.boost = clamp(car.boost - dt * 0.34, 0, 1);
  else car.boost = clamp(car.boost + dt * 0.16, 0, 1);

  if (car.grounded) {
    var vmax = boosting ? 30 : 22;
    var accel = throttle > 0 ? (boosting ? 17 : 11) : throttle < 0 ? -9 : 0;
    /* braking bites harder than reverse thrust */
    if (throttle < 0 && car.vf > 0.5) accel = -20;
    car.vf += accel * dt;
    car.vf -= car.vf * (hand ? 1.4 : 0.42) * dt;
    car.vf -= Math.sign(car.vf) * 1.4 * dt;
    if (Math.abs(car.vf) < 0.05 && !throttle) car.vf = 0;
    car.vf = clamp(car.vf, -9, vmax);

    var speedFactor = clamp(Math.abs(car.vf) / 7, 0, 1) * (1 - clamp(Math.abs(car.vf) / 90, 0, 0.45));
    var steerTarget = turn * 0.52;
    car.steer = damp(car.steer, steerTarget, 12, dt);
    car.yawRate = car.steer * 2.5 * speedFactor * Math.sign(car.vf || 1);
    car.yaw += car.yawRate * dt;

    /* lateral velocity: grip pulls it back to zero, handbrake lets it run */
    car.vr += -car.yawRate * car.vf * dt * (hand ? 1.35 : 0.72);
    car.vr *= Math.exp(-(hand ? 1.5 : 7.5) * dt);
    car.vr = clamp(car.vr, -22, 22);
    car.slip = damp(car.slip, Math.abs(car.vr), 10, dt);
  } else {
    /* airborne: the same two inputs become attitude control */
    car.pitchVel = damp(car.pitchVel, throttle * 3.1, 6, dt);
    car.rollVel = damp(car.rollVel, turn * 3.6, 6, dt);
    car.pitch += car.pitchVel * dt;
    car.roll += car.rollVel * dt;
    car.yaw += car.yawRate * dt * 0.35;
    car.vf -= car.vf * 0.06 * dt;
    car.slip = damp(car.slip, 0, 4, dt);
    car.steer = damp(car.steer, 0, 5, dt);
  }

  var fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
  var rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
  var vx = fx * car.vf + rx * car.vr;
  var vz = fz * car.vf + rz * car.vr;
  var prevX = car.x, prevZ = car.z;
  car.x += vx * dt;
  car.z += vz * dt;
  car.spin += car.vf / WHEEL_R * dt;

  /* push out of solid scenery */
  for (var b = 0; b < BLOCKS.length; b++) {
    var bl = BLOCKS[b];
    var bdx = car.x - bl.x, bdz = car.z - bl.z;
    var bd = Math.hypot(bdx, bdz), reach = bl.r + 1.5;
    if (bd < reach && bd > 0.001) {
      var k = (reach - bd) / bd;
      car.x += bdx * k; car.z += bdz * k;
      car.vf *= 0.7; car.vr *= 0.7;
    }
  }

  /* soft arena wall */
  var rad = Math.hypot(car.x, car.z);
  if (rad > 90) {
    var push = (rad - 90) / rad;
    car.x -= car.x * push * 1.02;
    car.z -= car.z * push * 1.02;
    car.vf *= 0.955;
  }

  /* sample the terrain under all four contact patches */
  var hw = TRACK * 0.5, hl = WHEELBASE * 0.5;
  function sample(lx, lz) {
    return groundAt(car.x + rx * lx + fx * lz, car.z + rz * lx + fz * lz);
  }
  var hFL = sample(-hw, hl), hFR = sample(hw, hl);
  var hRL = sample(-hw, -hl), hRR = sample(hw, -hl);
  var hFront = (hFL + hFR) * 0.5, hRear = (hRL + hRR) * 0.5;
  var hLeft = (hFL + hRL) * 0.5, hRight = (hFR + hRR) * 0.5;
  var terrainY = (hFront + hRear) * 0.5 + RIDE;

  /* a ramp's back face is a wall, not a lift: refuse a step that would jump the car up */
  if (car.grounded && terrainY > car.y + 0.7) {
    car.x = prevX; car.z = prevZ;
    car.vf *= 0.3; car.vr *= 0.3;
  } else if (car.grounded) {
    /* test the crest against the climb rate built up on the way UP — updating
       climb first would already have collapsed it to the falling rate */
    if (terrainY < car.y - 0.05 && car.climb > 1.2) {
      car.grounded = false;
      car.vy = clamp(car.climb * 0.92, 0, 17);
    } else {
      car.climb = damp(car.climb, clamp((terrainY - car.y) / dt, -30, 30), 22, dt);
      car.y = terrainY;
      car.pitch = damp(car.pitch, Math.atan2(hFront - hRear, WHEELBASE), 14, dt);
      car.roll = damp(car.roll, Math.atan2(hRight - hLeft, TRACK), 14, dt);
      car.air = 0;
    }
  }
  if (!car.grounded) {
    car.vy -= 27 * dt;
    car.y += car.vy * dt;
    car.air += dt;
    if (car.y <= terrainY) {
      car.y = terrainY;
      car.vy = 0;
      car.grounded = true;
      car.climb = 0;
      /* landing sideways or nose-first scrubs speed */
      var upright = Math.cos(car.pitch) * Math.cos(car.roll);
      if (upright < 0.75) car.vf *= 0.55 + 0.3 * clamp(upright, 0, 1);
      car.pitchVel = car.rollVel = 0;
      car.pitch = wrapAngle(car.pitch);
      car.roll = wrapAngle(car.roll);
    }
  }

  /* skid marks from the rear contact patches */
  if (car.grounded && (car.slip > 3.2 || (hand && Math.abs(car.vf) > 6))) {
    var w = 0.34;
    for (var s = -1; s <= 1; s += 2) {
      var sx = car.x + rx * (hw * s) - fx * hl;
      var sz = car.z + rz * (hw * s) - fz * hl;
      SKIDS.push({ x: sx, y: groundAt(sx, sz) + 0.02, z: sz, yaw: car.yaw, w: w, life: 1 });
    }
    while (SKIDS.length > SKID_MAX) SKIDS.shift();
  }
  for (var i = SKIDS.length - 1; i >= 0; i--) {
    SKIDS[i].life -= dt * 0.055;
    if (SKIDS[i].life <= 0) SKIDS.splice(i, 1);
  }
  return boosting;
}
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/* ----------------------------------------------------------- checkpoints ---- */
var dossier = document.getElementById("dossier");
var dTag = document.getElementById("dossierTag");
var dTitle = document.getElementById("dossierTitle");
var dBody = document.getElementById("dossierBody");
var labelHost = document.getElementById("zoneLabels");
var activeZone = null;

ZONES.forEach(function (z) {
  var d = document.createElement("div");
  d.className = "zlabel";
  var b = document.createElement("b"); b.textContent = z.name;
  var i = document.createElement("i"); i.textContent = z.hint;
  d.appendChild(b); d.appendChild(i);
  labelHost.appendChild(d);
  z.el = d;
  z.inside = false;
  /* the yaw that aims a chevron along the required approach heading */
  z.ry = Math.atan2(z.dir[0], z.dir[1]);
});

function openZone(z) {
  if (gamesMode) { car.vf = car.vr = 0; keys = Object.create(null); window.showGame(z.game); return; }
  activeZone = z;
  dTag.textContent = z.tag;
  dTitle.textContent = z.name;
  dBody.innerHTML = z.body;
  dossier.scrollTop = 0;
  dossier.classList.add("on");
  document.body.classList.add("zone-open");
}
function closeZone() {
  activeZone = null;
  dossier.classList.remove("on");
  document.body.classList.remove("zone-open");
}

/* a pad only opens for a car that is actually moving through it the right way:
   heading is the facing vector, flipped when the car is reversing */
var HOLD = 4;          /* seconds a card stays up after the car has left the pad */
var hold = 0;

function updateZones(dt) {
  dt = dt || 0;
  var sgn = car.vf < -0.2 ? -1 : 1;
  var hx = -Math.sin(car.yaw) * sgn, hz = -Math.cos(car.yaw) * sgn;
  var moving = Math.abs(car.vf) > 1.2;

  for (var i = 0; i < ZONES.length; i++) {
    var z = ZONES[i];
    var d = Math.hypot(car.x - z.x, car.z - z.z);
    /* hysteresis: you have to clear the pad properly before it counts as leaving */
    var wasInside = z.inside;
    var inside = gamesMode
      ? Math.abs(car.x - z.x) < z.r + (wasInside ? 2.4 : 0) && Math.abs(car.z - z.z) < z.r + (wasInside ? 2.4 : 0)
      : z.inside ? d < z.r + 2.4 : d < z.r;
    z.inside = inside;

    if (gamesMode) {
      if (inside && !wasInside) { openZone(z); return; }
      continue;
    }
    if (inside) {
      var aligned = hx * z.dir[0] + hz * z.dir[1] > 0.55;
      if (aligned && moving && activeZone !== z) openZone(z);
      if (activeZone === z) hold = HOLD;
    }
  }
  /* a pad is only a few car lengths across, so the card outlives the drive-through */
  if (activeZone && !activeZone.inside) {
    if (dossier.matches(":hover") || dossier.contains(document.activeElement)) return;
    hold -= dt;
    if (hold <= 0) closeZone();
  }
}

/* --------------------------------------------------------------- camera ---- */
var viewM = new Float32Array(16), projM = new Float32Array(16), invVP = new Float32Array(16);
var camWorld = new Float32Array(16);

function updateCamera(dt, time) {
  cam.roll = damp(cam.roll, cam.targetRoll, 7, dt);
  if (keys.q) { cam.targetRoll -= 2.1 * dt; cam.roll -= 2.1 * dt; }
  if (keys.e) { cam.targetRoll += 2.1 * dt; cam.roll += 2.1 * dt; }

  if (cam.mode === TOPDOWN) {
    /* straight overhead, north-up: -Z is up the screen, so W drives the car up */
    cam.yaw = dampAngle(cam.yaw, 0, 6, dt);
    cam.pitch = damp(cam.pitch, -Math.PI * 0.5, 6, dt);
  } else if (cam.mode === CHASE) {
    /* chase: swing back behind the car, offset by however far the user dragged */
    cam.yaw = dampAngle(cam.yaw, car.yaw + cam.userYaw, 3.4, dt);
  } else if (cam.mode === CINE) {
    cam.yaw += dt * 0.24;
    cam.pitch = damp(cam.pitch, -0.30 + Math.sin(time * 0.31) * 0.22, 1.6, dt);
  }
  /* orbit leaves cam.yaw exactly where the pointer left it */

  var lift = 1.05 + clamp(Math.abs(car.vf) / 60, 0, 0.4);
  cam.tx = damp(cam.tx, car.x, 9, dt);
  cam.ty = damp(cam.ty, car.y + lift, 7, dt);
  cam.tz = damp(cam.tz, car.z, 9, dt);

  var dist = cam.dist * (1 + clamp(Math.abs(car.vf) / 130, 0, 0.22));

  /* build the camera basis directly — no lookAt, no fixed up vector, so pitch
     can pass straight through vertical and keep going */
  var rot = m4mul(m4rotY(cam.yaw, tmpA), m4rotX(cam.pitch, tmpB), new Float32Array(16));
  m4mul(rot, m4rotZ(cam.roll, tmpC), rot);
  var ox = rot[8] * dist, oy = rot[9] * dist, oz = rot[10] * dist;
  var px = cam.tx + ox, py = cam.ty + oy, pz = cam.tz + oz;

  /* keep the lens above the floor without ever locking the pitch */
  var floor = groundAt(px, pz) + 0.35;
  if (py < floor) py = floor;

  cam.pos[0] = px; cam.pos[1] = py; cam.pos[2] = pz;
  camWorld.set(rot);
  camWorld[12] = px; camWorld[13] = py; camWorld[14] = pz;
  m4invert(camWorld, viewM);
}
function dampAngle(a, b, rate, dt) {
  var d = wrapAngle(b - a);
  return a + d * (1 - Math.exp(-rate * dt));
}

/* --------------------------------------------------------------- render ---- */
var SUN = (function () {
  var v = [0.42, 0.58, -0.70];
  var l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

var M = new Float32Array(16);
var vpM = new Float32Array(16);

/* posts and approach chevrons around each checkpoint pad */
function drawZones(time) {
  for (var i = 0; i < ZONES.length; i++) {
    var z = ZONES[i];
    var hot = activeZone === z;
    var pulse = 0.5 + 0.5 * Math.sin(time * 2.4 + i);
    var glow = hot ? 0.95 : 0.22 + pulse * 0.30;

    for (var sx = -1; sx <= 1; sx += 2) {
      for (var sz = -1; sz <= 1; sz += 2) {
        draw(MESH.box, pose(z.x + sx * z.r, 0.6, z.z + sz * z.r, 0, 0, 0, 0.34, 1.2, 0.34, M),
             C.rampLip, 0, glow);
      }
    }
    /* chevrons sit on the side you must come from and run into the pad */
    for (var a = 0; a < (gamesMode ? 0 : 3); a++) {
      var off = z.r + 1.8 + a * 2.4;
      var e = hot ? 0.9 : 0.18 + 0.72 * Math.max(0, Math.sin(time * 3 - a * 0.9));
      draw(MESH.cone,
           pose(z.x - z.dir[0] * off, 0.17, z.z - z.dir[1] * off, z.ry, Math.PI * 0.5, 0,
                1.7, 2.0, 0.28, M),
           C.rampLip, 0, e);
    }
  }
}

/* screen position of a world point, or null when it is behind the lens */
var projTmp = [0, 0];
function project(x, y, z) {
  var m = vpM;
  var cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (cw <= 0.001) return null;
  var cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  var cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  projTmp[0] = (cx / cw * 0.5 + 0.5) * window.innerWidth;
  projTmp[1] = (0.5 - cy / cw * 0.5) * window.innerHeight;
  return projTmp;
}

function updateLabels() {
  for (var i = 0; i < ZONES.length; i++) {
    var z = ZONES[i];
    var p = project(z.x, z.r * 0.5 + 1.6, z.z);
    var on = !!p && p[0] > -140 && p[0] < window.innerWidth + 140 &&
                    p[1] > -60 && p[1] < window.innerHeight + 60;
    if (on) z.el.style.transform = "translate(-50%,-100%) translate(" +
                                   p[0].toFixed(1) + "px," + p[1].toFixed(1) + "px)";
    z.el.classList.toggle("on", on);
    z.el.classList.toggle("hot", activeZone === z);
  }
}

function drawCar(boosting) {
  var body = m4trans(car.x, car.y, car.z, new Float32Array(16));
  m4mul(body, m4rotY(car.yaw, tmpA), body);
  m4mul(body, m4rotX(car.pitch, tmpB), body);
  m4mul(body, m4rotZ(car.roll, tmpC), body);

  function part(px, py, pz, sx, sy, sz, color, emis, ry) {
    var local = m4trans(px, py, pz, tmpA);
    if (ry) m4mul(local, m4rotY(ry, tmpB), local);
    m4mul(local, m4scale(sx, sy, sz, tmpC), local);
    m4mul(body, local, M);
    draw(MESH.box, M, color, 0, emis);
  }

  /* nose points down local -Z, matching the forward vector the physics uses */
  part(0, 0.10, -0.05, 1.86, 0.46, 4.10, C.body, 0);          /* chassis      */
  part(0, -0.10, -0.05, 1.62, 0.30, 3.86, C.bodyLo, 0);        /* lower skirt  */
  part(0, 0.30, -1.12, 1.34, 0.16, 1.24, C.body, 0);           /* hood bulge   */
  part(0, 0.47, 0.30, 1.52, 0.28, 1.74, C.glass, 0.05);        /* greenhouse   */
  part(0, 0.66, 0.34, 1.56, 0.11, 1.46, C.trim, 0);            /* roof         */
  part(0, 0.34, 1.52, 1.70, 0.10, 0.84, C.trim, 0);            /* rear deck    */
  part(0.62, 0.52, 1.84, 0.09, 0.34, 0.28, C.trim, 0);         /* wing stay R  */
  part(-0.62, 0.52, 1.84, 0.09, 0.34, 0.28, C.trim, 0);        /* wing stay L  */
  part(0, 0.71, 1.86, 1.74, 0.08, 0.48, C.trim, 0);            /* rear wing    */
  part(0.94, 0.06, -0.10, 0.10, 0.26, 2.10, C.trim, 0);        /* side skirt R */
  part(-0.94, 0.06, -0.10, 0.10, 0.26, 2.10, C.trim, 0);       /* side skirt L */
  part(0, -0.14, -2.00, 1.80, 0.09, 0.32, C.trim, 0);          /* front splitter */
  /* the map view looks straight down, so the direction cues live on the deck:
     a pale arrow over the nose, dark plates and a red bar over the tail */
  part(0.26, 0.415, -1.12, 0.15, 0.05, 1.15, C.mark, 0.22, 0.26);   /* chevron R  */
  part(-0.26, 0.415, -1.12, 0.15, 0.05, 1.15, C.mark, 0.22, -0.26); /* chevron L  */
  part(0, 0.415, -0.95, 0.17, 0.05, 0.90, C.mark, 0.22);            /* spine      */
  part(0, 0.40, 1.58, 1.58, 0.05, 0.24, C.tail, 0.55);              /* tail bar   */
  /* the lamps sit proud of the nose so they read from above as well as ahead */
  part(0.60, 0.28, -2.06, 0.46, 0.20, 0.12, C.head, 0.85);     /* headlights   */
  part(-0.60, 0.28, -2.06, 0.46, 0.20, 0.12, C.head, 0.85);
  part(0.58, 0.18, 2.02, 0.50, 0.12, 0.10, C.tail, 0.70);      /* taillights   */
  part(-0.58, 0.18, 2.02, 0.50, 0.12, 0.10, C.tail, 0.70);

  /* exhaust flame while boosting */
  if (boosting) {
    var f = 0.5 + Math.random() * 0.7;
    for (var s = -1; s <= 1; s += 2) {
      var local = m4trans(s * 0.42, -0.06, 2.12 + f * 0.4, tmpA);
      m4mul(local, m4rotX(-Math.PI * 0.5, tmpB), local);
      m4mul(local, m4scale(0.30, 0.9 * f + 0.4, 0.30, tmpC), local);
      m4mul(body, local, M);
      draw(MESH.cone, M, C.flame, 2, 0);
    }
  }

  /* wheels */
  for (var i = 0; i < 4; i++) {
    var front = i < 2, side = (i % 2) ? 1 : -1;
    var wx = side * (TRACK * 0.5), wz = front ? -WHEELBASE * 0.5 : WHEELBASE * 0.5;
    var hub = m4trans(wx, -0.06, wz, tmpA);
    if (front) m4mul(hub, m4rotY(car.steer, tmpB), hub);
    m4mul(hub, m4rotX(car.spin, tmpC), hub);
    var tyre = m4mul(hub, m4scale(0.36, WHEEL_R * 2, WHEEL_R * 2, tmpB), new Float32Array(16));
    m4mul(body, tyre, M);
    draw(MESH.wheel, M, C.tyre, 0, 0);
    var rim = m4mul(hub, m4scale(0.38, WHEEL_R * 0.94, WHEEL_R * 0.34, tmpB), new Float32Array(16));
    m4mul(body, rim, M);
    draw(MESH.wheel, M, C.rim, 0, 0.05);
  }
  return body;
}

function frame(time, dt, boosting) {
  var w = canvas.width, h = canvas.height;
  gl.viewport(0, 0, w, h);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  projM = m4persp(Math.PI / 3.5, w / h, 0.1, 600);
  m4mul(projM, viewM, vpM);
  m4invert(vpM, invVP);

  /* sky */
  gl.useProgram(skyProg);
  gl.depthMask(false);
  gl.disable(gl.DEPTH_TEST);
  gl.uniformMatrix4fv(SU.invVP, false, invVP);
  gl.uniform3fv(SU.cam, cam.pos);
  gl.uniform3fv(SU.sun, SUN);
  gl.uniform3fv(SU.top, SKY_TOP);
  gl.uniform3fv(SU.hor, SKY_HOR);
  gl.uniform3fv(SU.low, SKY_LOW);
  gl.uniform3fv(SU.glow, GLOW);
  gl.uniform3fv(SU.glow2, GLOW2);
  gl.uniform3fv(SU.band, BAND);
  gl.bindVertexArray(null);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);

  gl.useProgram(mainProg);
  gl.uniformMatrix4fv(U.proj, false, projM);
  gl.uniformMatrix4fv(U.view, false, viewM);
  gl.uniform3fv(U.cam, cam.pos);
  gl.uniform3fv(U.sun, SUN);
  gl.uniform3fv(U.grid, GRID_LINE);
  gl.uniform3fv(U.lip, LIP);
  gl.uniform3fv(U.ambLo, AMB_LO);
  gl.uniform3fv(U.ambHi, AMB_HI);
  gl.uniform3fv(U.sunCol, SUN_COL);
  gl.uniform3fv(U.fog, SKY_HOR);

  /* ground */
  draw(MESH.plane, pose(0, 0, 0, 0, 0, 0, 460, 1, 460, M), C.ground, 1, 0);

  /* ramps */
  for (var i = 0; i < RAMPS.length; i++) {
    var r = RAMPS[i];
    draw(MESH.wedge, pose(r.x, 0, r.z, r.yaw, 0, 0, r.w, r.h, r.len, M), C.ramp, 0, 0);
    var lipX = r.x + Math.sin(r.yaw) * (r.len * 0.5);
    var lipZ = r.z + Math.cos(r.yaw) * (r.len * 0.5);
    draw(MESH.box, pose(lipX, r.h, lipZ, r.yaw, 0, 0, r.w, 0.14, 0.34, M), C.rampLip, 0, 0.55);
  }

  /* props */
  for (i = 0; i < PROPS.length; i++) {
    var p = PROPS[i];
    if (p.kind === "pillar") {
      draw(MESH.box, pose(p.x, p.h * 0.5, p.z, p.yaw, 0, 0, p.w, p.h, p.w, M), C.pillar, 0, 0);
      draw(MESH.box, pose(p.x, p.h + 0.12, p.z, p.yaw, 0, 0, p.w * 1.05, 0.16, p.w * 1.05, M), C.rampLip, 0, 0.5);
    } else if (p.kind === "cone") {
      draw(MESH.cone, pose(p.x, p.h * 0.5, p.z, 0, 0, 0, 0.72, p.h, 0.72, M), C.coneA, 0, 0.05);
    } else {
      draw(MESH.box, pose(p.x, p.h * 0.5, p.z, p.yaw, 0, 0, p.w, p.h, p.w * 0.7, M), C.pillar, 0, 0);
    }
  }

  drawZones(time);

  var body = drawCar(boosting);

  /* blended ground decals last: pad markings, skid marks and contact shadow */
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);

  for (i = 0; i < ZONES.length; i++) {
    var z = ZONES[i];
    var hotZ = activeZone === z;
    var pz = 0.5 + 0.5 * Math.sin(time * 2.4 + i);
    var edge = C.rampLip;
    /* an accent square with a darker square punched out of it reads as a ring */
    draw(MESH.plane, pose(z.x, 0.012, z.z, 0, 0, 0, z.r * 2 + 1.1, 1, z.r * 2 + 1.1, M),
         [edge[0], edge[1], edge[2], hotZ ? 0.62 : 0.20 + pz * 0.14], 2, 0);
    draw(MESH.plane, pose(z.x, 0.016, z.z, 0, 0, 0, z.r * 2 - 0.4, 1, z.r * 2 - 0.4, M),
         [C.ground[0], C.ground[1], C.ground[2], 0.94], 2, 0);
    draw(MESH.plane, pose(z.x, 0.018, z.z, 0, 0, 0, z.r * 2 - 0.4, 1, z.r * 2 - 0.4, M),
         [edge[0], edge[1], edge[2], hotZ ? 0.16 : 0.05 + pz * 0.03], 2, 0);
  }

  for (i = 0; i < SKIDS.length; i++) {
    var s = SKIDS[i];
    var col = [C.skid[0], C.skid[1], C.skid[2], C.skid[3] * clamp(s.life, 0, 1)];
    draw(MESH.plane, pose(s.x, s.y, s.z, s.yaw, 0, 0, s.w, 1, 0.9, M), col, 2, 0);
  }

  var gh = groundAt(car.x, car.z);
  var height = clamp(car.y - gh - RIDE, 0, 8);
  var sa = C.shadow[3] * (1 - height / 9);
  var ss = 1 + height * 0.11;
  draw(MESH.plane, pose(car.x, gh + 0.015, car.z, car.yaw, 0, 0, 2.4 * ss, 1, 4.6 * ss, M),
       [C.shadow[0], C.shadow[1], C.shadow[2], sa], 2, 0);

  gl.depthMask(true);
  gl.disable(gl.BLEND);
  return body;
}

/* ------------------------------------------------------------------ HUD ---- */
var el = {
  speed: document.getElementById("speed"),
  gear: document.getElementById("gear"),
  gauge: document.getElementById("gaugeFill"),
  boost: document.getElementById("boostBar"),
  air: document.getElementById("airBar"),
  camMode: document.getElementById("camMode"),
  aPitch: document.getElementById("aPitch"),
  aRoll: document.getElementById("aRoll"),
  aCar: document.getElementById("aCar"),
  boostBtn: document.getElementById("btnBoost"),
  inv: document.getElementById("invFlag")
};
var hudTick = 0;
function updateHud() {
  var kmh = Math.abs(car.vf) * 3.6;
  el.speed.textContent = Math.round(kmh);
  el.gauge.setAttribute("stroke-dashoffset", String(100 - clamp(kmh / 115, 0, 1) * 100));
  el.gear.textContent = car.vf > 0.4 ? (kmh > 92 ? "6" : kmh > 72 ? "5" : kmh > 52 ? "4" : kmh > 32 ? "3" : kmh > 14 ? "2" : "1")
                      : car.vf < -0.4 ? "R" : "N";
  el.boost.style.width = (car.boost * 100).toFixed(0) + "%";
  el.boostBtn.style.setProperty("--lvl", car.boost.toFixed(3));
  el.air.style.width = (clamp(car.air / 2.4, 0, 1) * 100).toFixed(0) + "%";
  el.camMode.textContent = MODES[cam.mode];

  var pd = Math.round(wrapAngle(cam.pitch) * 180 / Math.PI);
  var rd = Math.round(wrapAngle(cam.roll) * 180 / Math.PI);
  el.aPitch.textContent = pd + "°";
  el.aRoll.textContent = rd + "°";

  /* the camera's own up vector tells us honestly whether the view is inverted */
  var upY = Math.cos(cam.roll) * Math.cos(cam.pitch);
  var inverted = upY < 0;
  el.inv.classList.toggle("on", inverted);

  var carUp = Math.cos(car.pitch) * Math.cos(car.roll);
  el.aCar.textContent = !car.grounded ? "Airborne" : carUp < -0.3 ? "Inverted"
                       : Math.abs(car.roll) > 0.25 || Math.abs(car.pitch) > 0.25 ? "Banked" : "Level";
}

/* ------------------------------------------------------------------ loop ---- */
function resize() {
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = Math.floor(window.innerWidth * dpr), h = Math.floor(window.innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
window.addEventListener("resize", resize);
resize();

gl.enable(gl.DEPTH_TEST);
/* culling stays off: every mesh carries explicit vertex normals, so back faces
   shade correctly, and the ground reads properly when the camera goes under it */
gl.disable(gl.CULL_FACE);
gl.clearColor(SKY_HOR[0], SKY_HOR[1], SKY_HOR[2], 1);

var last = performance.now(), acc = 0, clock = 0;
function loop(now) {
  var dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  clock += dt;
  resize();

  var boosting = false;
  if (started && !(gamesMode && window.gamePanelOpen)) {
    acc += dt;
    var fixed = 1 / 120, guard = 0;
    while (acc >= fixed && guard++ < 8) { boosting = step(fixed) || boosting; acc -= fixed; }
    updateZones(dt);
  }
  updateCamera(dt, clock);
  frame(clock, dt, boosting);
  updateLabels();
  if (++hudTick % 3 === 0) updateHud();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* read/write handle on the simulation, used by the headless test harness */
window.rollcage = { car: car, cam: cam, ramps: RAMPS, zones: ZONES, groundAt: groundAt,
                    step: step, tickZones: updateZones,
                    active: function () { return activeZone && activeZone.id; },
                    start: function () { started = true; setCamMode(TOPDOWN); } };

/* boot */
var boot = document.getElementById("boot");
document.getElementById("startBtn").addEventListener("click", function () {
  started = true;
  setCamMode(TOPDOWN);          /* the idle orbit hands off to the map view */
  cam.userYaw = 0;
  boot.classList.add("gone");
  setTimeout(function () { boot.style.display = "none"; }, 520);
  canvas.focus();
});
})();
