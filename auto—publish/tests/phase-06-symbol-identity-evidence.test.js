const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createMemoryProgram,
  verifyCapabilityEvidence,
} = require("./helpers/typescript-symbol-evidence");

function queryFiles(overrides = {}) {
  return {
    "/electron.ts": `
      export const ipcRenderer = { invoke() {}, on() {}, removeListener() {} };
    `,
    "/preload.ts": `
      import { ipcRenderer } from "./electron";
      export const desktopConsole = { media: {
        loadOrders: () => ipcRenderer.invoke("media:get-orders"),
        onChanged(listener) {
          const wrapped = (_event, payload) => listener(payload);
          ipcRenderer.on("media:changed", wrapped);
          return () => ipcRenderer.removeListener("media:changed", wrapped);
        },
      } };
    `,
    "/bridge.ts": `
      import { desktopConsole } from "./preload";
      export async function loadOrders() { return desktopConsole.media.loadOrders(); }
      export function onChanged(listener) { return desktopConsole.media.onChanged(listener); }
    `,
    "/feature.ts": `
      export function createFeature(deps) {
        let snapshot = { orders: [] };
        async function refresh() {
          snapshot = { orders: await deps.loadOrders() };
        }
        return { refresh, getSnapshot: () => snapshot };
      }
    `,
    "/composition.ts": `
      import { createFeature } from "./feature";
      import { loadOrders } from "./bridge";
      export const feature = createFeature({ loadOrders });
    `,
    "/view.ts": `
      import { feature } from "./composition";
      export function View() {
        feature.refresh();
        const snapshot = feature.getSnapshot();
        return snapshot.orders;
      }
    `,
    "/registrar.ts": `
      export function register(ipcMain, application) {
        ipcMain.handle("media:get-orders", async () => application.listOrderViews());
      }
    `,
    "/registration-entry.ts": `import { register } from "./registrar"; export function registerProduction(ipcMain, application) { register(ipcMain, application); } registerProduction({ handle() {} }, { listOrderViews() {} });`,
    "/producer.ts": `export function emitChanged(sender: {send(channel:string,payload:unknown):void}, payload: unknown) { sender.send("media:changed", payload); }`,
    "/application.ts": `
      const mainWindow = { webContents: { send(_channel: string, _payload: unknown) {} } };
      export function sendToRenderer(channel: string, payload: unknown) {
        mainWindow.webContents.send(channel, payload);
      }
    `,
    "/producer-entry.ts": `import { emitChanged } from "./producer"; import { sendToRenderer } from "./application"; emitChanged({ send: sendToRenderer }, {});`,
    "/entry.ts": `import { View } from "./view"; const root={render(_value){}}; root.render(View());`,
    ...overrides,
  };
}

const queryFixture = Object.freeze({
  capability: "media.getOrders",
  channel: "media:get-orders",
  kind: "invoke",
  productionCaller: {
    consumer: {
      kind: "lifecycle",
      source: "/view.ts",
      entrySource: "/entry.ts",
      owner: "View",
      receiver: "feature",
      method: "refresh",
      featureSource: "/feature.ts",
      featureMethod: "refresh",
      stateSource: "/view.ts",
      stateRoot: "snapshot",
      stateField: "orders",
      stateOwner: "View",
    },
    feature: "/composition.ts",
    bridge: "/bridge.ts",
    bridgeSymbol: "loadOrders",
    preload: "/preload.ts",
    preloadMethod: "loadOrders",
    preloadReceiverSource: "/electron.ts",
    preloadReceiverExport: "ipcRenderer",
    registrar: "/registrar.ts",
    registrationEntry: "/registration-entry.ts",
    registrationEntryOwner: "registerProduction",
    registrationReceiver: "ipcMain",
    registrationApplication: "application",
    registrarOwner: "register",
    registrarReceiver: "ipcMain",
    application: "application.listOrderViews",
    featureBinding: "loadOrders",
  },
});

function eventFiles(overrides = {}) {
  return {
    ...queryFiles(),
    "/event-feature.ts": `
      export function createEventFeature(deps) {
        let disposeChanged = null;
        function start() { disposeChanged = deps.onChanged(() => {}); }
        function dispose() { disposeChanged?.(); }
        return { start, dispose };
      }
    `,
    "/event-composition.ts": `
      import { createEventFeature } from "./event-feature";
      import { onChanged } from "./bridge";
      export const eventFeature = createEventFeature({ onChanged });
    `,
    "/event-view.ts": `
      import { eventFeature } from "./event-composition";
      export function EventView() { eventFeature.start(); eventFeature.dispose(); return null; }
    `,
    "/entry.ts": `import { EventView } from "./event-view"; EventView();`,
    ...overrides,
  };
}

const eventFixture = Object.freeze({
  capability: "media.changed",
  channel: "media:changed",
  kind: "event",
  productionCaller: {
    consumer: {
      kind: "event",
      source: "/event-view.ts",
      entrySource: "/entry.ts",
      owner: "EventView",
      receiver: "eventFeature",
      method: "start",
      cleanupMethod: "dispose",
      featureSource: "/event-feature.ts",
      featureMethod: "start",
    },
    feature: "/event-composition.ts",
    bridge: "/bridge.ts",
    bridgeSymbol: "onChanged",
    preload: "/preload.ts",
    preloadMethod: "onChanged",
    preloadReceiverSource: "/electron.ts",
    preloadReceiverExport: "ipcRenderer",
    registrar: "/registrar.ts",
    application: "webContents.send",
    featureBinding: "onChanged",
    producer: "/producer.ts",
    producerEntry: "/producer-entry.ts",
    producerOwner: "emitChanged",
    producerApplication: "sender.send",
    applicationSource: "/application.ts",
    applicationOwner: "sendToRenderer",
    applicationReceiver: "mainWindow.webContents",
  },
});

function verify(files, fixture) {
  const evidence = createMemoryProgram(files);
  const context = {
    ...evidence,
    applicationRoot: "/",
    resolveSource: (file) => evidence.program.getSourceFile(file),
  };
  return verifyCapabilityEvidence(context, fixture);
}

test("the single TypeChecker evidence core accepts connected query and event capabilities", () => {
  const queryResult = verify(queryFiles(), queryFixture);
  const eventResult = verify(eventFiles(), eventFixture);
  assert.equal(queryResult.ok, true, queryResult.reasons.join("\n"));
  assert.equal(eventResult.ok, true, eventResult.reasons.join("\n"));
});

test("single production evidence core rejects an event feature cleanup that production never calls", () => {
  const result = verify(
    eventFiles({
      "/event-view.ts": `import {eventFeature} from "./event-composition";export function EventView(){eventFeature.start();return null}`,
    }),
    eventFixture,
  );
  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "event subscription cleanup is not callable-reachable from the recorded renderer entry",
    ),
    result.reasons.join("\n"),
  );
});

test("event application evidence fails closed without a recorded owner and receiver", () => {
  const {
    applicationSource: _applicationSource,
    applicationOwner: _applicationOwner,
    applicationReceiver: _applicationReceiver,
    ...productionCaller
  } = eventFixture.productionCaller;
  const result = verify(eventFiles(), { ...eventFixture, productionCaller });
  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "event application symbol is not the producer send call member",
    ),
    result.reasons.join("\n"),
  );
});

const queryMutations = [
  [
    "owner只被entry导入但从未调用",
    { "/entry.ts": `import { View } from "./view"; void View;` },
    "consumer owner is not callable-reachable from the recorded renderer entry",
  ],
  [
    "terminal method同名但receiver symbol不同",
    {
      "/view.ts": `import { feature } from "./composition"; const other={refresh(){}}; export function View(){ other.refresh(); const snapshot=feature.getSnapshot(); return snapshot.orders; }`,
    },
    "consumer call is not in the reachable production owner or uses another receiver symbol",
  ],
  [
    "receiver文本相同但来自局部shadow",
    {
      "/view.ts": `import { feature } from "./composition"; export function View(){ const feature={refresh(){},getSnapshot(){return {orders:[]}}}; feature.refresh(); const snapshot=feature.getSnapshot(); return snapshot.orders; }`,
    },
    "consumer call is not in the reachable production owner or uses another receiver symbol",
  ],
  [
    "consumer调用同一factory创建的错误feature实例",
    {
      "/view.ts": `import { feature } from "./composition"; import { createFeature } from "./feature"; const other = createFeature({ loadOrders: async () => [] }); export function View(){ other.refresh(); const snapshot=feature.getSnapshot(); return snapshot.orders; }`,
    },
    "consumer receiver is not the recorded production feature instance",
  ],
  [
    "同名helper位于另一函数作用域",
    {
      "/feature.ts": `export function createFeature(deps){let snapshot={orders:[]};function unrelated(){function helper(){return deps.loadOrders()}return helper}async function helper(){return []}async function refresh(){snapshot={orders:await helper()}}return{refresh,getSnapshot:()=>snapshot}}`,
    },
    "feature member symbol does not reach the bridge parameter binding",
  ],
  [
    "bridge binding只在feature文件其他位置使用",
    {
      "/feature.ts": `export function createFeature(deps){let snapshot={orders:[]};async function unrelated(){return deps.loadOrders()}async function refresh(){snapshot={orders:[]}}return{refresh,getSnapshot:()=>snapshot}}`,
    },
    "feature member symbol does not reach the bridge parameter binding",
  ],
  [
    "feature member与binding同名但body不使用binding",
    {
      "/feature.ts": `export function createFeature(deps){let snapshot={orders:[]};async function loadOrders(){snapshot={orders:[]}}return{refresh:loadOrders,getSnapshot:()=>snapshot}}`,
    },
    "feature member symbol does not reach the bridge parameter binding",
  ],
  [
    "bridge import未传给feature factory",
    {
      "/composition.ts": `import {createFeature} from "./feature"; import {loadOrders} from "./bridge"; const fake=async()=>[]; export const feature=createFeature({loadOrders:fake});`,
    },
    "bridge import symbol is not passed to the feature factory binding",
  ],
  [
    "bridge调用错误receiver上的同名preload method",
    {
      "/bridge.ts": `const fake={loadOrders(){return []}}; export async function loadOrders(){return fake.loadOrders()} export function onChanged(){return()=>{}}`,
    },
    "bridge export does not call the recorded preload member symbol",
  ],
  [
    "registrar把channel与application放在外层不同调用",
    {
      "/registrar.ts": `function wrap(a,b){} function helper(x){return x} export function register(ipcMain,application){wrap(ipcMain.handle("media:get-orders",async()=>true),helper(()=>application.listOrderViews()))}`,
    },
    "real ipcMain registration does not bind channel to application symbol",
  ],
  [
    "registrar handler调用同名但不同symbol的方法",
    {
      "/registrar.ts": `export function register(ipcMain,application){const other={listOrderViews(){}};ipcMain.handle("media:get-orders",async()=>other.listOrderViews())}`,
    },
    "real ipcMain registration does not bind channel to application symbol",
  ],
  [
    "正确registration只存在于dead registrar helper",
    {
      "/registrar.ts": `export function register(ipcMain,application){ipcMain.handle("media:other",async()=>application.other())} function dead(ipcMain,application){ipcMain.handle("media:get-orders",async()=>application.listOrderViews())}`,
    },
    "real ipcMain registration does not bind channel to application symbol",
  ],
  [
    "lifecycle stateSource不存在",
    {},
    "lifecycle state source is missing",
    {
      consumer: {
        ...queryFixture.productionCaller.consumer,
        stateSource: "/missing.ts",
      },
    },
  ],
  [
    "lifecycle字段未由query路径更新",
    {
      "/feature.ts": `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){await deps.loadOrders();snapshot={other:[]}}return{refresh,getSnapshot:()=>snapshot}}`,
    },
    "lifecycle query does not update the recorded snapshot field",
  ],
  [
    "lifecycle query只更新无关对象上的同名字段",
    {
      "/feature.ts": `export function createFeature(deps){let snapshot={orders:[]};let unrelated={orders:[]};async function refresh(){await deps.loadOrders();unrelated={orders:[]}}return{refresh,getSnapshot:()=>snapshot}}`,
    },
    "lifecycle query does not update the recorded snapshot field",
  ],
  [
    "lifecycle query结果未流入snapshot字段",
    {
      "/feature.ts": `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){await deps.loadOrders();snapshot={orders:[]}}return{refresh,getSnapshot:()=>snapshot}}`,
    },
    "lifecycle query result does not reach the recorded snapshot field",
  ],
  [
    "lifecycle query结果被comma expression丢弃",
    {
      "/feature.ts": `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){snapshot={orders:(await deps.loadOrders(),[])}}return{refresh,getSnapshot:()=>snapshot}}`,
    },
    "lifecycle query result does not reach the recorded snapshot field",
  ],
  [
    "lifecycle snapshot字段无真实consumer",
    {
      "/view.ts": `import {feature} from "./composition"; export function View(){feature.refresh();const snapshot=feature.getSnapshot();return null}`,
    },
    "lifecycle snapshot field has no reachable production consumer",
  ],
  [
    "lifecycle snapshot字段仅被void读取",
    {
      "/view.ts": `import {feature} from "./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();void snapshot.orders;return null}`,
    },
    "lifecycle snapshot field has no reachable production consumer",
  ],
  [
    "lifecycle consumer缺少owner时不能从全文件借用dead读取",
    {
      "/view.ts": `import {feature} from "./composition"; export function View(){feature.refresh();const snapshot=feature.getSnapshot();function Dead(){return snapshot.orders}return null}`,
    },
    "lifecycle snapshot consumer owner is not callable-reachable from the recorded renderer entry",
    {
      consumer: {
        ...queryFixture.productionCaller.consumer,
        stateOwner: undefined,
      },
    },
  ],
  [
    "lifecycle UI读取无关局部snapshot的同名字段",
    {
      "/view.ts": `import {feature} from "./composition"; export function View(){feature.refresh();const snapshot={orders:[]};return snapshot.orders}`,
    },
    "lifecycle snapshot consumer is not derived from the recorded feature snapshot",
  ],
  [
    "目标call site只位于dead export",
    {
      "/view.ts": `import {feature} from "./composition"; export function View(){const snapshot=feature.getSnapshot();return snapshot.orders} export function Dead(){feature.refresh()}`,
    },
    "consumer call is not in the reachable production owner or uses another receiver symbol",
  ],
];

for (const [name, override, reason, callerOverride] of queryMutations) {
  test(`single production evidence core rejects query mutation: ${name}`, () => {
    const fixture = callerOverride
      ? {
          ...queryFixture,
          productionCaller: {
            ...queryFixture.productionCaller,
            ...callerOverride,
          },
        }
      : queryFixture;
    const result = verify(queryFiles(override), fixture);
    assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
    assert.ok(result.reasons.includes(reason), result.reasons.join("\n"));
  });
}

test("single production evidence core rejects props callback wired to another symbol", () => {
  const files = queryFiles({
    "/view.ts": `import {feature} from "./composition"; function Child({onRefresh}){onRefresh();return null} function other(){} export function View(){const snapshot=feature.getSnapshot();return <Child onRefresh={other} value={snapshot.orders}/>}`,
  });
  const fixture = {
    ...queryFixture,
    productionCaller: {
      ...queryFixture.productionCaller,
      consumer: {
        ...queryFixture.productionCaller.consumer,
        owner: "Child",
        receiver: "",
        method: "onRefresh",
        wiringSource: "/view.ts",
        wiringProp: "onRefresh",
      },
    },
  };
  const result = verify(files, fixture);
  assert.equal(result.ok, false);
  assert.ok(
    result.reasons.includes(
      "consumer callee symbol is not closed by explicit parent wiring",
    ),
    result.reasons.join("\n"),
  );
});

const eventMutations = [
  [
    "无producer",
    {},
    "event producer source is missing",
    { producer: "/missing.ts" },
  ],
  [
    "producer发送错误channel",
    {
      "/producer.ts": `export function emitChanged(sender,payload){sender.send("media:other",payload)}`,
    },
    "event producer application does not send the recorded channel",
  ],
  [
    "正确producer send只存在于dead helper",
    {
      "/producer.ts": `export function emitChanged(sender,payload){sender.send("media:other",payload)} function dead(sender,payload){sender.send("media:changed",payload)}`,
    },
    "event producer application does not send the recorded channel",
  ],
  [
    "正确producer send只存在于导出入口内未调用的arrow helper",
    {
      "/producer.ts": `export function emitChanged(sender,payload){sender.send("media:other",payload);const dead=()=>sender.send("media:changed",payload);void dead}`,
    },
    "event producer application does not send the recorded channel",
  ],
  [
    "存在第二直接bridge consumer",
    {
      "/second-consumer.ts": `import {onChanged} from "./bridge"; export const second=onChanged(()=>{});`,
    },
    "event bridge export does not have exactly one direct production consumer",
  ],
  [
    "同一import存在第二直接bridge consumer",
    {
      "/event-composition.ts": `import {createEventFeature} from "./event-feature";import {onChanged} from "./bridge";export const eventFeature=createEventFeature({onChanged});export const second=onChanged(()=>{});`,
    },
    "event bridge export does not have exactly one direct production consumer",
  ],
  [
    "preload无dispose",
    {
      "/preload.ts": `const ipcRenderer={invoke(){},on(){},removeListener(){}};export const desktopConsole={media:{loadOrders:()=>ipcRenderer.invoke("media:get-orders"),onChanged(listener){const wrapped=(_event,payload)=>listener(payload);ipcRenderer.on("media:changed",wrapped);return()=>{}}}}`,
    },
    "event preload does not remove the same channel and callback",
  ],
  [
    "preload dispose使用不同callback",
    {
      "/preload.ts": `const ipcRenderer={invoke(){},on(){},removeListener(){}};export const desktopConsole={media:{loadOrders:()=>ipcRenderer.invoke("media:get-orders"),onChanged(listener){const wrapped=(_event,payload)=>listener(payload);const other=()=>{};ipcRenderer.on("media:changed",wrapped);return()=>ipcRenderer.removeListener("media:changed",other)}}}`,
    },
    "event preload does not remove the same channel and callback",
  ],
  [
    "preload返回noop而正确removeListener只在dead nested helper",
    {
      "/preload.ts": `const ipcRenderer={invoke(){},on(){},removeListener(){}};export const desktopConsole={media:{loadOrders:()=>ipcRenderer.invoke("media:get-orders"),onChanged(listener){const wrapped=(_event,payload)=>listener(payload);ipcRenderer.on("media:changed",wrapped);function dead(){ipcRenderer.removeListener("media:changed",wrapped)}return()=>{}}}}`,
    },
    "event preload does not remove the same channel and callback",
  ],
  [
    "feature无dispose",
    {
      "/event-feature.ts": `export function createEventFeature(deps){function start(){deps.onChanged(()=>{})}function dispose(){}return{start,dispose}}`,
    },
    "event feature does not dispose the recorded subscription",
  ],
  [
    "错误application evidence",
    {},
    "event producer application does not send the recorded channel",
    { producerApplication: "other.send" },
  ],
  [
    "错误event application evidence",
    {},
    "event application symbol is not the producer send call member",
    { application: "missing.send" },
  ],
];

for (const [name, override, reason, callerOverride] of eventMutations) {
  test(`single production evidence core rejects event mutation: ${name}`, () => {
    const fixture = callerOverride
      ? {
          ...eventFixture,
          productionCaller: {
            ...eventFixture.productionCaller,
            ...callerOverride,
          },
        }
      : eventFixture;
    const result = verify(eventFiles(override), fixture);
    assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
    assert.ok(result.reasons.includes(reason), result.reasons.join("\n"));
  });
}

const finalAuditMutations = [
  [
    "event application不能借用Program内ipcRenderer.invoke",
    eventFiles(),
    { application: "ipcRenderer.invoke" },
    eventFixture,
    "event application symbol is not the producer send call member",
  ],
  [
    "event application不能借用Program内ipcRenderer.on",
    eventFiles(),
    { application: "ipcRenderer.on" },
    eventFixture,
    "event application symbol is not the producer send call member",
  ],
  [
    "event application不能借用Program内console.log",
    eventFiles({
      "/unrelated.ts": `const console={log(){}};console.log("media:changed")`,
    }),
    { application: "console.log" },
    eventFixture,
    "event application symbol is not the producer send call member",
  ],
  [
    "event application owner必须与producer send属于同一调用链",
    eventFiles({
      "/application.ts": `export function unrelated(webContents:{send(channel:string,payload:unknown):void}){webContents.send("totally:unrelated",{})}`,
    }),
    {
      application: "webContents.send",
      applicationSource: "/application.ts",
      applicationOwner: "unrelated",
      applicationReceiver: "webContents",
    },
    eventFixture,
    "event application symbol is not the producer send call member",
  ],
  [
    "event application receiver不能用属性路径后缀冒充真实symbol",
    eventFiles({
      "/application.ts": `const mainWindow={webContents:{send(_channel:string,_payload:unknown){}}};export function sendToRenderer(channel:string,payload:unknown){const fake={webContents:{send(_channel:string,_payload:unknown){}}};fake.webContents.send(channel,payload)};void mainWindow`,
      "/producer-entry.ts": `import {emitChanged} from "./producer";import {sendToRenderer} from "./application";emitChanged({send:sendToRenderer},{})`,
    }),
    {
      application: "webContents.send",
      applicationSource: "/application.ts",
      applicationOwner: "sendToRenderer",
      applicationReceiver: "mainWindow.webContents",
    },
    eventFixture,
    "event application symbol is not the producer send call member",
  ],
  [
    "event application不能借用记录entry之外的producer callsite",
    eventFiles({
      "/application.ts": `export function sendToRenderer(channel:string,payload:unknown){const webContents:{send(channel:string,payload:unknown):void}={send(){}};webContents.send(channel,payload)}`,
      "/producer-entry.ts": `import {emitChanged} from "./producer";emitChanged({send(){}},{})`,
      "/unrelated.ts": `import {emitChanged} from "./producer";import {sendToRenderer} from "./application";emitChanged({send:sendToRenderer},{})`,
    }),
    {
      application: "webContents.send",
      applicationSource: "/application.ts",
      applicationOwner: "sendToRenderer",
      applicationReceiver: "webContents",
    },
    eventFixture,
    "event application symbol is not the producer send call member",
  ],
  [
    "未被production entry调用的exported producer不能作为根",
    eventFiles({
      "/producer.ts": `export function emitChanged(sender,payload){sender.send("media:changed",payload)} export function used(sender,payload){sender.send("media:other",payload)}`,
      "/producer-entry.ts": `import { used } from "./producer"; used({send(){}}, {});`,
    }),
    { producerOwner: "emitChanged" },
    eventFixture,
    "event producer owner is not callable-reachable from the recorded production entry",
  ],
  [
    "producer module仅被import但owner未调用不能作为根",
    eventFiles({
      "/producer-entry.ts": `import { emitChanged } from "./producer"; void emitChanged;`,
    }),
    {},
    eventFixture,
    "event producer owner is not callable-reachable from the recorded production entry",
  ],
  [
    "producer只在静态不可达分支中调用不能作为真实call site",
    eventFiles({
      "/producer-entry.ts": `import {emitChanged} from "./producer";import {sendToRenderer} from "./application";export function createProducerEntry(){if(false)emitChanged({send:sendToRenderer},{})}createProducerEntry();`,
    }),
    { producerEntryOwner: "createProducerEntry" },
    eventFixture,
    "event producer owner is not callable-reachable from the recorded production entry",
  ],
  [
    "producer只在静态不可达循环中调用不能作为真实call site",
    eventFiles({
      "/producer-entry.ts": `import {emitChanged} from "./producer";import {sendToRenderer} from "./application";export function createProducerEntry(){while(false)emitChanged({send:sendToRenderer},{})}createProducerEntry();`,
    }),
    { producerEntryOwner: "createProducerEntry" },
    eventFixture,
    "event producer owner is not callable-reachable from the recorded production entry",
  ],
  [
    "producer只在无条件return之后调用不能作为真实call site",
    eventFiles({
      "/producer-entry.ts": `import {emitChanged} from "./producer";import {sendToRenderer} from "./application";export function createProducerEntry(){return;emitChanged({send:sendToRenderer},{})}createProducerEntry();`,
    }),
    { producerEntryOwner: "createProducerEntry" },
    eventFixture,
    "event producer owner is not callable-reachable from the recorded production entry",
  ],
  [
    "producer只在短路逻辑右侧调用不能作为真实call site",
    eventFiles({
      "/producer-entry.ts": `import {emitChanged} from "./producer";import {sendToRenderer} from "./application";export function createProducerEntry(){false&&emitChanged({send:sendToRenderer},{})}createProducerEntry();`,
    }),
    { producerEntryOwner: "createProducerEntry" },
    eventFixture,
    "event producer owner is not callable-reachable from the recorded production entry",
  ],
  [
    "producer只在静态非nullish右侧调用不能作为真实call site",
    eventFiles({
      "/producer-entry.ts": `import {emitChanged} from "./producer";import {sendToRenderer} from "./application";export function createProducerEntry(){1??emitChanged({send:sendToRenderer},{})}createProducerEntry();`,
    }),
    { producerEntryOwner: "createProducerEntry" },
    eventFixture,
    "event producer owner is not callable-reachable from the recorded production entry",
  ],
  [
    "entry返回但未消费的callback不能让producer可达",
    eventFiles({
      "/producer-entry.ts": `import {emitChanged} from "./producer";import {sendToRenderer} from "./application";export function createProducerEntry(){return()=>emitChanged({send:sendToRenderer},{})}createProducerEntry();`,
    }),
    { producerEntryOwner: "createProducerEntry" },
    eventFixture,
    "event producer owner is not callable-reachable from the recorded production entry",
  ],
  [
    "producer内return之后的send不能作为application证据",
    eventFiles({
      "/producer.ts": `export function emitChanged(sender,payload){return;sender.send("media:changed",payload)}`,
    }),
    {},
    eventFixture,
    "event producer application does not send the recorded channel",
  ],
  [
    "composition comma expression只取最终有效值",
    queryFiles({
      "/composition.ts": `import {createFeature} from "./feature"; import {loadOrders} from "./bridge"; const fake=async()=>[]; export const feature=createFeature({loadOrders:(void loadOrders,fake)});`,
    }),
    {},
    queryFixture,
    "bridge import symbol is not passed to the feature factory binding",
  ],
  [
    "composition不确定conditional必须fail-closed",
    queryFiles({
      "/composition.ts": `import {createFeature} from "./feature"; import {loadOrders} from "./bridge"; const fake=async()=>[]; declare const condition:boolean; export const feature=createFeature({loadOrders:condition?loadOrders:fake});`,
    }),
    {},
    queryFixture,
    "bridge import symbol is not passed to the feature factory binding",
  ],
  [
    "composition nested unused occurrence不能冒充目标binding",
    queryFiles({
      "/composition.ts": `import {createFeature} from "./feature"; import {loadOrders} from "./bridge"; const fake=async()=>[]; export const feature=createFeature({loadOrders:{unused:{loadOrders},actual:fake}.actual});`,
    }),
    {},
    queryFixture,
    "bridge import symbol is not passed to the feature factory binding",
  ],
  [
    "composition wrapper调用bridge但返回fake不能冒充实际binding",
    queryFiles({
      "/composition.ts": `import {createFeature} from "./feature";import {loadOrders} from "./bridge";const fake=async()=>[];export const feature=createFeature({loadOrders:()=>{loadOrders();return fake()}})`,
    }),
    {},
    queryFixture,
    "bridge import symbol is not passed to the feature factory binding",
  ],
  [
    "composition只能在factory实际依赖参数中闭合bridge",
    queryFiles({
      "/feature.ts": `export function createFeature(_options,deps){let snapshot={orders:[]};async function refresh(){snapshot={orders:await deps.loadOrders()}}return{refresh,getSnapshot:()=>snapshot}}`,
      "/composition.ts": `import {createFeature} from "./feature";import {loadOrders} from "./bridge";const fake=async()=>[];export const feature=createFeature({loadOrders},{loadOrders:fake})`,
    }),
    {},
    queryFixture,
    "bridge import symbol is not passed to the feature factory binding",
  ],
  [
    "composition不确定conditional不能在两个factory实例中只闭合一个",
    queryFiles({
      "/composition.ts": `import {createFeature} from "./feature";import {loadOrders} from "./bridge";const fake=async()=>[];declare const condition:boolean;export const feature=condition?createFeature({loadOrders}):createFeature({loadOrders:fake})`,
    }),
    {},
    queryFixture,
    "consumer receiver is not the recorded production feature instance",
  ],
  [
    "preload transport member无法解析时必须fail-closed",
    queryFiles({
      "/electron.ts": `export const ipcRenderer:any={};`,
    }),
    {},
    queryFixture,
    "preload member does not invoke the recorded Electron ipcRenderer symbol",
  ],
  [
    "preload fake receiver不能冒充Electron ipcRenderer.invoke",
    queryFiles({
      "/preload.ts": `import {ipcRenderer} from "./electron"; const fake={invoke(){}}; export const desktopConsole={media:{loadOrders:()=>fake.invoke("media:get-orders"),onChanged(){return()=>{}}}}; void ipcRenderer;`,
    }),
    {},
    queryFixture,
    "preload member does not invoke the recorded Electron ipcRenderer symbol",
  ],
  [
    "preload shadow ipcRenderer不能冒充Electron binding",
    queryFiles({
      "/preload.ts": `import {ipcRenderer as electronIpcRenderer} from "./electron"; function make(ipcRenderer){return {media:{loadOrders:()=>ipcRenderer.invoke("media:get-orders"),onChanged(){return()=>{}}}}} export const desktopConsole=make({invoke(){}}); void electronIpcRenderer;`,
    }),
    {},
    queryFixture,
    "preload member does not invoke the recorded Electron ipcRenderer symbol",
  ],
  [
    "preload dead nested helper不能提供transport证据",
    queryFiles({
      "/preload.ts": `import {ipcRenderer} from "./electron";function hidden(){function dead(){return ipcRenderer.invoke("media:get-orders")}return []}export const desktopConsole={media:{loadOrders:hidden,onChanged(){return()=>{}}}}`,
    }),
    {},
    queryFixture,
    "preload member does not invoke the recorded Electron ipcRenderer symbol",
  ],
  [
    "event preload fake on/removeListener即使channel与callback相同也失败",
    eventFiles({
      "/preload.ts": `import {ipcRenderer} from "./electron"; const fake={on(){},removeListener(){}}; export const desktopConsole={media:{loadOrders:()=>ipcRenderer.invoke("media:get-orders"),onChanged(listener){const wrapped=(_event,payload)=>listener(payload);fake.on("media:changed",wrapped);return()=>fake.removeListener("media:changed",wrapped)}}};`,
    }),
    {},
    eventFixture,
    "event preload does not use the recorded Electron ipcRenderer receiver",
  ],
  [
    "event preload只在静态不可达分支removeListener不能作为dispose证据",
    eventFiles({
      "/preload.ts": `import {ipcRenderer} from "./electron";export const desktopConsole={media:{loadOrders:()=>ipcRenderer.invoke("media:get-orders"),onChanged(listener){const wrapped=(_event,payload)=>listener(payload);ipcRenderer.on("media:changed",wrapped);return()=>{if(false)ipcRenderer.removeListener("media:changed",wrapped)}}}};`,
    }),
    {},
    eventFixture,
    "event preload does not remove the same channel and callback",
  ],
  [
    "event preload在return之后removeListener不能作为dispose证据",
    eventFiles({
      "/preload.ts": `import {ipcRenderer} from "./electron";export const desktopConsole={media:{loadOrders:()=>ipcRenderer.invoke("media:get-orders"),onChanged(listener){const wrapped=(_event,payload)=>listener(payload);ipcRenderer.on("media:changed",wrapped);return()=>{return;ipcRenderer.removeListener("media:changed",wrapped)}}}};`,
    }),
    {},
    eventFixture,
    "event preload does not remove the same channel and callback",
  ],
  [
    "event feature只在静态不可达分支调用disposer不能作为dispose证据",
    eventFiles({
      "/event-feature.ts": `export function createEventFeature(deps){let disposeChanged=null;function start(){disposeChanged=deps.onChanged(()=>{})}function dispose(){if(false)disposeChanged?.()}return{start,dispose}}`,
    }),
    {},
    eventFixture,
    "event feature does not dispose the recorded subscription",
  ],
  [
    "event feature在return之后调用disposer不能作为dispose证据",
    eventFiles({
      "/event-feature.ts": `export function createEventFeature(deps){let disposeChanged=null;function start(){disposeChanged=deps.onChanged(()=>{})}function dispose(){return;disposeChanged?.()}return{start,dispose}}`,
    }),
    {},
    eventFixture,
    "event feature does not dispose the recorded subscription",
  ],
  [
    "registrar other.handle不能冒充真实ipcMain",
    queryFiles({
      "/registrar.ts": `export function register(ipcMain,application){const other={handle(){}};other.handle("media:get-orders",async()=>application.listOrderViews());void ipcMain}`,
    }),
    {},
    queryFixture,
    "real ipcMain registration does not bind channel to application symbol",
  ],
  [
    "registrar shadow ipcMain不能冒充production entry传入binding",
    queryFiles({
      "/registrar.ts": `export function register(realIpcMain,application){const ipcMain={handle(){}};ipcMain.handle("media:get-orders",async()=>application.listOrderViews());void realIpcMain}`,
    }),
    { registrarReceiver: "realIpcMain" },
    queryFixture,
    "real ipcMain registration does not bind channel to application symbol",
  ],
  [
    "registrar receiver错误时handler内正确channel与application也不能通过",
    queryFiles({
      "/registrar.ts": `export function register(ipcMain,application){const other={handle(){}};other.handle("media:get-orders",async()=>application.listOrderViews());ipcMain.handle("media:other",async()=>application.other())}`,
    }),
    {},
    queryFixture,
    "real ipcMain registration does not bind channel to application symbol",
  ],
  [
    "registrar helper的receiver参数必须由真实ipcMain实参闭合",
    queryFiles({
      "/registrar.ts": `function helper(ipcMain,application){ipcMain.handle("media:get-orders",async()=>application.listOrderViews())}export function register(ipcMain,application){const other={handle(){}};helper(other,application);void ipcMain}`,
    }),
    {},
    queryFixture,
    "real ipcMain registration does not bind channel to application symbol",
  ],
  [
    "registrar receiver逻辑回退的任一运行时分支都必须闭合真实ipcMain",
    queryFiles({
      "/registration-entry.ts": `import {register} from "./registrar";export function registerProduction(ipcMain,application){register(ipcMain||{handle(){}},application)}registerProduction(null,{listOrderViews(){}});`,
    }),
    {},
    queryFixture,
    "real ipcMain registration does not bind channel to application symbol",
  ],
  [
    "registrar Object.assign后续参数覆盖真实receiver时必须失败",
    queryFiles({
      "/registration-entry.ts": `import {register} from "./registrar";const fake={handle(){}};export function registerProduction(ipcMain,application){register(Object.assign({},ipcMain,fake),application)}registerProduction({handle(){}},{listOrderViews(){}});`,
    }),
    {},
    queryFixture,
    "real ipcMain registration does not bind channel to application symbol",
  ],
  [
    "registrar handler中未调用的nested function不能提供application证据",
    queryFiles({
      "/registrar.ts": `export function register(ipcMain,application){ipcMain.handle("media:get-orders",async()=>{function dead(){return application.listOrderViews()}return []})}`,
    }),
    {},
    queryFixture,
    "real ipcMain registration does not bind channel to application symbol",
  ],
  [
    "registration entry在return之后调用registrar不能作为真实组装",
    queryFiles({
      "/registration-entry.ts": `import {register} from "./registrar";export function registerProduction(ipcMain,application){return;register(ipcMain,application)}registerProduction({handle(){}},{listOrderViews(){}});`,
    }),
    {},
    queryFixture,
    "real ipcMain registration does not bind channel to application symbol",
  ],
  [
    "registrar在return之后的handle不能作为真实registration",
    queryFiles({
      "/registrar.ts": `export function register(ipcMain,application){return;ipcMain.handle("media:get-orders",async()=>application.listOrderViews())}`,
    }),
    {},
    queryFixture,
    "real ipcMain registration does not bind channel to application symbol",
  ],
  [
    "registrar handler在return之后调用application不能闭合证据",
    queryFiles({
      "/registrar.ts": `export function register(ipcMain,application){ipcMain.handle("media:get-orders",async()=>{return [];return application.listOrderViews()})}`,
    }),
    {},
    queryFixture,
    "real ipcMain registration does not bind channel to application symbol",
  ],
];

for (const [name, files, callerOverride, fixture] of finalAuditMutations) {
  test(`final independent audit mutation rejects: ${name}`, () => {
    const result = verify(files, {
      ...fixture,
      productionCaller: { ...fixture.productionCaller, ...callerOverride },
    });
    const reason = finalAuditMutations.find((entry) => entry[0] === name)[4];
    assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
    assert.ok(result.reasons.includes(reason), result.reasons.join("\n"));
  });
}

test("single production evidence core rejects feature wiring supplied only by dead JSX", () => {
  const fixture = {
    ...queryFixture,
    productionCaller: {
      ...queryFixture.productionCaller,
      consumer: {
        ...queryFixture.productionCaller.consumer,
        source: "/view.tsx",
        stateSource: "/view.tsx",
      },
    },
  };
  const result = verify(
    queryFiles({
      "/view.ts": "",
      "/view.tsx": `
        import { feature as realFeature } from "./composition";
        export function View({ feature }: { feature: typeof realFeature }) {
          feature.refresh();
          const snapshot = feature.getSnapshot();
          return <div>{snapshot.orders.length}</div>;
        }
        export function Root() {
          const fake: typeof realFeature = {
            refresh: async () => {},
            getSnapshot: () => ({ orders: [] }),
          };
          return <View feature={fake} />;
        }
        function Dead() { return <View feature={realFeature} />; }
      `,
      "/entry.ts": `import { Root } from "./view.tsx"; Root();`,
    }),
    fixture,
  );
  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "consumer receiver is not the recorded production feature instance",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects reachability supplied only by an uncalled callback", () => {
  const producerOwner = verify(
    eventFiles({
      "/producer-entry.ts": `import {emitChanged} from "./producer";function ignore(_callback:()=>void){};ignore(()=>emitChanged({send(){}},{}))`,
    }),
    eventFixture,
  );
  const producerSend = verify(
    eventFiles({
      "/producer.ts": `function ignore(_callback:()=>void){};export function emitChanged(sender:{send(channel:string,payload:unknown):void},payload:unknown){ignore(()=>sender.send("media:changed",payload))}`,
    }),
    eventFixture,
  );
  const registrar = verify(
    queryFiles({
      "/registrar.ts": `function ignore(_callback:()=>void){};function helper(ipcMain,application){ipcMain.handle("media:get-orders",async()=>application.listOrderViews())};export function register(ipcMain,application){ignore(()=>helper(ipcMain,application))}`,
    }),
    queryFixture,
  );
  assert.deepEqual(
    [
      {
        ok: producerOwner.ok,
        rejectedForReachability: producerOwner.reasons.includes(
          "event producer owner is not callable-reachable from the recorded production entry",
        ),
      },
      {
        ok: producerSend.ok,
        rejectedForReachability: producerSend.reasons.includes(
          "event producer application does not send the recorded channel",
        ),
      },
      {
        ok: registrar.ok,
        rejectedForReachability: registrar.reasons.includes(
          "real ipcMain registration does not bind channel to application symbol",
        ),
      },
    ],
    [
      { ok: false, rejectedForReachability: true },
      { ok: false, rejectedForReachability: true },
      { ok: false, rejectedForReachability: true },
    ],
  );
});

test("single production evidence core rejects a Renderer consumer supplied only by an uncalled callback", () => {
  const result = verify(
    queryFiles({
      "/view.ts": `import {feature} from "./composition";function ignore(_callback:()=>void){};export function View(){ignore(()=>feature.refresh());const snapshot=feature.getSnapshot();return snapshot.orders}`,
    }),
    queryFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "consumer call is not in the reachable production owner or uses another receiver symbol",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects a Renderer owner reached only through an uncalled entry callback", () => {
  const result = verify(
    queryFiles({
      "/entry.ts": `import {View} from "./view";function ignore(_callback:()=>void){};ignore(()=>View())`,
    }),
    queryFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "consumer owner is not callable-reachable from the recorded renderer entry",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects a Renderer owner passed through an unused JSX prop", () => {
  const result = verify(
    queryFiles({
      "/entry.tsx": `import {View} from "./view";function Sink(_props:{unused:()=>unknown}){return null}function Root(){return <Sink unused={View}/>}Root()`,
    }),
    {
      ...queryFixture,
      productionCaller: {
        ...queryFixture.productionCaller,
        consumer: {
          ...queryFixture.productionCaller.consumer,
          entrySource: "/entry.tsx",
        },
      },
    },
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "consumer owner is not callable-reachable from the recorded renderer entry",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects a Renderer owner represented only by an unrendered JSX element", () => {
  for (const entry of [
    `import {View} from "./view";function Root(){void <View/>;return null}Root()`,
    `import {View} from "./view";function Sink(_props:{child:unknown}){return null}function Root(){return <Sink child={<View/>}/>}Root()`,
  ]) {
    const result = verify(
      queryFiles({ "/entry.ts": "", "/entry.tsx": entry }),
      {
        ...queryFixture,
        productionCaller: {
          ...queryFixture.productionCaller,
          consumer: {
            ...queryFixture.productionCaller.consumer,
            entrySource: "/entry.tsx",
          },
        },
      },
    );

    assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
    assert.ok(
      result.reasons.includes(
        "consumer owner is not callable-reachable from the recorded renderer entry",
      ),
      result.reasons.join("\n"),
    );
  }
});

test("single production evidence core rejects calls confined to immutable false guards", () => {
  const consumer = verify(
    queryFiles({
      "/entry.ts": `import {View} from "./view";const NEVER=false;if(NEVER)View()`,
    }),
    queryFixture,
  );
  const preload = verify(
    queryFiles({
      "/preload.ts": `import {ipcRenderer} from "./electron";const NEVER=false;export const desktopConsole={media:{loadOrders:()=>{if(NEVER)return ipcRenderer.invoke("media:get-orders");return []}}};`,
    }),
    queryFixture,
  );
  const registrar = verify(
    queryFiles({
      "/registrar.ts": `const NEVER=false;export function register(ipcMain,application){if(NEVER)ipcMain.handle("media:get-orders",async()=>application.listOrderViews());ipcMain.handle("media:other",async()=>null)}`,
    }),
    queryFixture,
  );

  assert.equal(consumer.ok, false, JSON.stringify(consumer.trace, null, 2));
  assert.ok(
    consumer.reasons.includes(
      "consumer owner is not callable-reachable from the recorded renderer entry",
    ),
  );
  assert.equal(preload.ok, false, JSON.stringify(preload.trace, null, 2));
  assert.ok(
    preload.reasons.includes(
      "preload member does not invoke the recorded Electron ipcRenderer symbol",
    ),
  );
  assert.equal(registrar.ok, false, JSON.stringify(registrar.trace, null, 2));
  assert.ok(
    registrar.reasons.includes(
      "real ipcMain registration does not bind channel to application symbol",
    ),
  );
});

test("single production evidence core follows a lazy component prop through an invoked collection and JSX callback", () => {
  const result = verify(
    queryFiles({
      "/entry.ts": `import {View} from "./lazy-view";View()`,
      "/lazy-view.tsx": `import {feature} from "./composition";declare function lazy<T>(load:()=>Promise<{default:T}>):T;const Child=lazy(()=>import("./child"));export function View(){return <Child onRefresh={()=>feature.refresh()}/>} `,
      "/child.tsx": `const items={map(callback:(item:number)=>unknown){return [callback(1)]}};export default function Child({onRefresh}:{onRefresh:()=>void}){return items.map((item)=><button key={item} onClick={()=>onRefresh()}/>)} `,
    }),
    {
      ...queryFixture,
      productionCaller: {
        ...queryFixture.productionCaller,
        consumer: {
          ...queryFixture.productionCaller.consumer,
          kind: "direct",
          source: "/lazy-view.tsx",
          entrySource: "/entry.ts",
          owner: "View",
        },
      },
    },
  );

  assert.equal(result.ok, true, result.reasons.join("\n"));
});

test("single production evidence core follows a component prop through a ref and an invoked options callback", () => {
  const result = verify(
    queryFiles({
      "/entry.ts": `import {View} from "./session-view";View()`,
      "/session-view.tsx": `import {feature} from "./composition";import Child from "./session-child";export function View(){return <Child onRefresh={()=>feature.refresh()}/>} `,
      "/session-child.tsx": `function createSession(options:{saveDraft:()=>void}){const value=options||{};function save(){value.saveDraft()}return{save}}export default function Child({onRefresh}:{onRefresh:()=>void}){const callbackRef={current:()=>{}};callbackRef.current=onRefresh;const session=createSession({saveDraft:()=>callbackRef.current()});return <button onClick={()=>session.save()}/>} `,
    }),
    {
      ...queryFixture,
      productionCaller: {
        ...queryFixture.productionCaller,
        consumer: {
          ...queryFixture.productionCaller.consumer,
          kind: "direct",
          source: "/session-view.tsx",
          entrySource: "/entry.ts",
          owner: "View",
        },
      },
    },
  );

  assert.equal(result.ok, true, result.reasons.join("\n"));
});

test("single production evidence core rejects an options callback behind an unused returned method", () => {
  const result = verify(
    queryFiles({
      "/entry.ts": `import {View} from "./session-view";View()`,
      "/session-view.tsx": `import {feature} from "./composition";import Child from "./session-child";export function View(){return <Child onRefresh={()=>feature.refresh()}/>} `,
      "/session-child.tsx": `function createSession(options:{saveDraft:()=>void}){function save(){options.saveDraft()}return{save}}export default function Child({onRefresh}:{onRefresh:()=>void}){const callbackRef={current:()=>{}};callbackRef.current=onRefresh;const session=createSession({saveDraft:()=>callbackRef.current()});void session;return <button/>} `,
    }),
    {
      ...queryFixture,
      productionCaller: {
        ...queryFixture.productionCaller,
        consumer: {
          ...queryFixture.productionCaller.consumer,
          kind: "direct",
          source: "/session-view.tsx",
          entrySource: "/entry.ts",
          owner: "View",
        },
      },
    },
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "consumer call is not in the reachable production owner or uses another receiver symbol",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects callback invocation confined to a static dead branch", () => {
  const result = verify(
    eventFiles({
      "/producer.ts": `function schedule(callback:()=>void){if(false)callback()}export function emitChanged(sender:{send(channel:string,payload:unknown):void},payload:unknown){schedule(()=>sender.send("media:changed",payload))}`,
    }),
    eventFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "event producer application does not send the recorded channel",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects a numeric static dead branch", () => {
  const result = verify(
    eventFiles({
      "/producer.ts": `export function emitChanged(sender,payload){if(0)sender.send("media:changed",payload)}`,
    }),
    eventFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "event producer application does not send the recorded channel",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects static dead switch and post-loop paths", () => {
  for (const producer of [
    `export function emitChanged(sender,payload){switch(0){case 1:sender.send("media:changed",payload);break}}`,
    `export function emitChanged(sender,payload){while(true){}sender.send("media:changed",payload)}`,
  ]) {
    const result = verify(
      eventFiles({ "/producer.ts": producer }),
      eventFixture,
    );
    assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
    assert.ok(
      result.reasons.includes(
        "event producer application does not send the recorded channel",
      ),
      result.reasons.join("\n"),
    );
  }
});

test("single production evidence core rejects paths after a local non-returning call", () => {
  const producer = verify(
    eventFiles({
      "/producer-entry.ts": `function abort(){throw new Error("stop")}import {emitChanged} from "./producer";import {sendToRenderer} from "./application";abort();emitChanged({send:sendToRenderer},{})`,
    }),
    eventFixture,
  );
  const registrar = verify(
    queryFiles({
      "/registration-entry.ts": `import {register} from "./registrar";function abort(){throw new Error("stop")}export function registerProduction(ipcMain,application){abort();register(ipcMain,application)}registerProduction({handle(){}},{listOrderViews(){}});`,
    }),
    queryFixture,
  );
  const cleanup = verify(
    eventFiles({
      "/event-view.ts": `import {eventFeature} from "./event-composition";function abort(){throw new Error("stop")}export function EventView(){eventFeature.start();abort();eventFeature.dispose();return null}`,
    }),
    eventFixture,
  );
  const cleanupViaThrowingCallback = verify(
    eventFiles({
      "/event-view.ts": `import {eventFeature} from "./event-composition";function abort(){throw new Error("stop")}function invoke(callback){callback()}export function EventView(){eventFeature.start();invoke(abort);eventFeature.dispose();return null}`,
    }),
    eventFixture,
  );
  const caughtCallback = verify(
    eventFiles({
      "/event-view.ts": `import {eventFeature} from "./event-composition";function abort(){throw new Error("stop")}function invoke(callback){try{callback()}catch{} }export function EventView(){eventFeature.start();invoke(abort);eventFeature.dispose();return null}`,
    }),
    eventFixture,
  );
  const finallyCleanup = verify(
    eventFiles({
      "/event-view.ts": `import {eventFeature} from "./event-composition";function abort(){throw new Error("stop")}export function EventView(){try{eventFeature.start();abort()}finally{eventFeature.dispose()}return null}`,
    }),
    eventFixture,
  );

  assert.equal(producer.ok, false, JSON.stringify(producer.trace, null, 2));
  assert.equal(registrar.ok, false, JSON.stringify(registrar.trace, null, 2));
  assert.equal(cleanup.ok, false, JSON.stringify(cleanup.trace, null, 2));
  assert.equal(
    cleanupViaThrowingCallback.ok,
    false,
    JSON.stringify(cleanupViaThrowingCallback.trace, null, 2),
  );
  assert.equal(caughtCallback.ok, true, caughtCallback.reasons.join("\n"));
  assert.equal(finallyCleanup.ok, true, finallyCleanup.reasons.join("\n"));
});

test("single production evidence core follows abrupt aliases without rejecting return helpers", () => {
  const alias = verify(
    eventFiles({
      "/producer-entry.ts": `function abort(){throw new Error("stop")}const alias=abort;import {emitChanged} from "./producer";import {sendToRenderer} from "./application";alias();emitChanged({send:sendToRenderer},{})`,
    }),
    eventFixture,
  );
  const loop = verify(
    eventFiles({
      "/producer-entry.ts": `function abort(){while(true){}}import {emitChanged} from "./producer";import {sendToRenderer} from "./application";abort();emitChanged({send:sendToRenderer},{})`,
    }),
    eventFixture,
  );
  const returnHelper = verify(
    eventFiles({
      "/producer-entry.ts": `function continueNormally(){return;}import {emitChanged} from "./producer";import {sendToRenderer} from "./application";continueNormally();emitChanged({send:sendToRenderer},{})`,
    }),
    eventFixture,
  );

  assert.equal(alias.ok, false, JSON.stringify(alias.trace, null, 2));
  assert.equal(loop.ok, false, JSON.stringify(loop.trace, null, 2));
  assert.equal(returnHelper.ok, true, returnHelper.reasons.join("\n"));
});

test("single production evidence core keeps callback-specific abruptness isolated per callsite", () => {
  const mixed = verify(
    eventFiles({
      "/event-view.ts": `import {eventFeature} from "./event-composition";function abort(){throw new Error("stop")}function normal(){}function invoke(callback){callback()}export function EventView(){eventFeature.start();invoke(normal);invoke(abort);eventFeature.dispose();return null}`,
    }),
    eventFixture,
  );
  const normalOnly = verify(
    eventFiles({
      "/event-view.ts": `import {eventFeature} from "./event-composition";function abort(){throw new Error("stop")}function normal(){}function invoke(callback){callback()}export function EventView(){eventFeature.start();invoke(normal);eventFeature.dispose();return null}`,
    }),
    eventFixture,
  );

  assert.equal(mixed.ok, false, JSON.stringify(mixed.trace, null, 2));
  assert.equal(normalOnly.ok, true, normalOnly.reasons.join("\n"));
});

test("single production evidence core handles callback abruptness around returns and finally", () => {
  const callbackThenReturn = verify(
    eventFiles({
      "/event-view.ts": `import {eventFeature} from "./event-composition";function abort(){throw new Error("stop")}function invoke(callback){callback();return}export function EventView(){eventFeature.start();invoke(abort);eventFeature.dispose();return null}`,
    }),
    eventFixture,
  );
  const callbackCaughtByFinallyReturn = verify(
    eventFiles({
      "/event-view.ts": `import {eventFeature} from "./event-composition";function abort(){throw new Error("stop")}function invoke(callback){try{callback()}finally{return}}export function EventView(){eventFeature.start();invoke(abort);eventFeature.dispose();return null}`,
    }),
    eventFixture,
  );
  const callbackAfterDynamicReturn = verify(
    eventFiles({
      "/event-view.ts": `import {eventFeature} from "./event-composition";function abort(){throw new Error("stop")}function invoke(callback){if(flag)return;callback()}export function EventView(){eventFeature.start();invoke(abort);eventFeature.dispose();return null}`,
    }),
    eventFixture,
  );

  assert.equal(
    callbackThenReturn.ok,
    false,
    JSON.stringify(callbackThenReturn.trace, null, 2),
  );
  assert.equal(
    callbackCaughtByFinallyReturn.ok,
    true,
    callbackCaughtByFinallyReturn.reasons.join("\n"),
  );
  assert.equal(
    callbackAfterDynamicReturn.ok,
    false,
    JSON.stringify(callbackAfterDynamicReturn.trace, null, 2),
  );
});

test("single production evidence core rejects a producer hidden in an unused returned object method", () => {
  const result = verify(
    eventFiles({
      "/producer-entry.ts": `import {emitChanged} from "./producer";import {sendToRenderer} from "./application";export function createProducerEntry(){return {dead(){emitChanged({send:sendToRenderer},{})}}}createProducerEntry()`,
    }),
    {
      ...eventFixture,
      productionCaller: {
        ...eventFixture.productionCaller,
        producerEntryOwner: "createProducerEntry",
      },
    },
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "event producer owner is not callable-reachable from the recorded production entry",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core requires disposal of the recorded feature subscription", () => {
  const result = verify(
    eventFiles({
      "/event-feature.ts": `export function createEventFeature(deps){const fake={onChanged(){return()=>{}}};let disposeChanged=null;function start(){deps.onChanged(()=>{});disposeChanged=fake.onChanged(()=>{})}function dispose(){disposeChanged?.()}return{start,dispose}}`,
    }),
    eventFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "event feature does not dispose the recorded subscription",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core accepts a guarded transfer of the recorded disposer", () => {
  const result = verify(
    eventFiles({
      "/event-feature.ts": `export function createEventFeature(deps){let disposeChanged=null;function start(){const unsubscribe=deps.onChanged(()=>{});disposeChanged=typeof unsubscribe === "function" ? unsubscribe : ()=>{}}function dispose(){disposeChanged?.()}return{start,dispose}}`,
    }),
    eventFixture,
  );

  assert.equal(result.ok, true, result.reasons.join("\n"));
});

test("single production evidence core accepts a direct alias of the recorded subscription binding", () => {
  const result = verify(
    eventFiles({
      "/event-feature.ts": `export function createEventFeature(options){const subscribe=options.onChanged;let disposeChanged=null;function start(){disposeChanged=subscribe(()=>{})}function dispose(){disposeChanged?.()}return{start,dispose}}`,
    }),
    eventFixture,
  );

  assert.equal(result.ok, true, result.reasons.join("\n"));
});

test("single production evidence core rejects a registrar reached with the wrong entry arguments", () => {
  const result = verify(
    queryFiles({
      "/registration-entry.ts": `import {register} from "./registrar";const realIpcMain={handle(){}};const fakeIpcMain={handle(){}};export function registerProduction(ipcMain,application){register(fakeIpcMain,application);void ipcMain};registerProduction(realIpcMain,{listOrderViews(){}})`,
    }),
    queryFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "real ipcMain registration does not bind channel to application symbol",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects a registrar reached with the wrong application argument", () => {
  const result = verify(
    queryFiles({
      "/registration-entry.ts": `import {register} from "./registrar";export function registerProduction(ipcMain,application){const fakeApplication={listOrderViews(){}};register(ipcMain,fakeApplication);void application};registerProduction({handle(){}},{listOrderViews(){}})`,
    }),
    queryFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "real ipcMain registration does not bind channel to application symbol",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects a producer after a terminating switch clause", () => {
  const result = verify(
    eventFiles({
      "/producer.ts": `export function emitChanged(sender,payload){switch(0){case 0:break;case 1:sender.send("media:changed",payload)}}`,
    }),
    eventFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "event producer application does not send the recorded channel",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects an internal registrar receiver fallback", () => {
  const result = verify(
    queryFiles({
      "/registrar.ts": `export function register(ipcMain,application){const fake={handle(){}};const receiver=ipcMain||fake;receiver.handle("media:get-orders",async()=>application.listOrderViews())}`,
    }),
    {
      ...queryFixture,
      productionCaller: {
        ...queryFixture.productionCaller,
        registrarReceiver: "receiver",
      },
    },
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "real ipcMain registration does not bind channel to application symbol",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects a disposer assigned only in a dead subscription", () => {
  const result = verify(
    eventFiles({
      "/event-feature.ts": `export function createEventFeature(deps){let disposeChanged=null;function start(){deps.onChanged(()=>{});if(false)disposeChanged=deps.onChanged(()=>{})}function dispose(){disposeChanged?.()}return{start,dispose}}`,
    }),
    eventFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "event feature does not dispose the recorded subscription",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects binary-constant dead paths", () => {
  const cases = [
    [
      "producer",
      {
        "/producer-entry.ts": `import { emitChanged } from "./producer"; import { sendToRenderer } from "./application"; if (1 === 2) emitChanged({ send: sendToRenderer }, {});`,
      },
    ],
    [
      "consumer",
      {
        "/event-view.ts": `import { eventFeature } from "./event-composition"; export function EventView(){if(1 === 2)eventFeature.start();return null;}`,
      },
    ],
    [
      "disposer",
      {
        "/event-feature.ts": `export function createEventFeature(deps){let disposeChanged=null;function start(){disposeChanged=deps.onChanged(()=>{})}function dispose(){if(1 === 2)disposeChanged?.()}return{start,dispose}}`,
      },
    ],
  ];
  for (const [name, overrides] of cases) {
    const result = verify(eventFiles(overrides), eventFixture);
    assert.equal(result.ok, false, `${name}: ${result.reasons.join("\n")}`);
  }
});

test("single production evidence core rejects undefined-family static dead paths", () => {
  for (const condition of ["undefined", "void 0", "NaN"]) {
    const producer = verify(
      eventFiles({
        "/producer.ts": `export function emitChanged(sender,payload){if(${condition})sender.send("media:changed",payload)}`,
      }),
      eventFixture,
    );
    assert.equal(
      producer.ok,
      false,
      `${condition}: ${producer.reasons.join("\n")}`,
    );

    const consumer = verify(
      eventFiles({
        "/event-view.ts": `import {eventFeature} from "./event-composition";export function EventView(){if(${condition})eventFeature.start();return null}`,
      }),
      eventFixture,
    );
    assert.equal(
      consumer.ok,
      false,
      `${condition}: ${consumer.reasons.join("\n")}`,
    );

    const preloadDisposer = verify(
      eventFiles({
        "/preload.ts": `import {ipcRenderer} from "./electron";export const desktopConsole={media:{loadOrders:()=>ipcRenderer.invoke("media:get-orders"),onChanged(listener){const wrapped=(_event,payload)=>listener(payload);ipcRenderer.on("media:changed",wrapped);return()=>{if(${condition})ipcRenderer.removeListener("media:changed",wrapped)}}}}`,
      }),
      eventFixture,
    );
    assert.equal(
      preloadDisposer.ok,
      false,
      `${condition}: ${preloadDisposer.reasons.join("\n")}`,
    );

    const featureDisposer = verify(
      eventFiles({
        "/event-feature.ts": `export function createEventFeature(deps){let disposeChanged=null;function start(){disposeChanged=deps.onChanged(()=>{})}function dispose(){if(${condition})disposeChanged?.()}return{start,dispose}}`,
      }),
      eventFixture,
    );
    assert.equal(
      featureDisposer.ok,
      false,
      `${condition}: ${featureDisposer.reasons.join("\n")}`,
    );
  }
});

test("single production evidence core rejects conditionally reachable disposer calls", () => {
  const cases = [
    [
      "preload",
      {
        "/preload.ts": `import {ipcRenderer} from "./electron";export const desktopConsole={media:{loadOrders:()=>ipcRenderer.invoke("media:get-orders"),onChanged(listener){const wrapped=(_event,payload)=>listener(payload);ipcRenderer.on("media:changed",wrapped);return()=>{if(flag)ipcRenderer.removeListener("media:changed",wrapped)}}}}`,
      },
    ],
    [
      "preload short-circuit",
      {
        "/preload.ts": `import {ipcRenderer} from "./electron";export const desktopConsole={media:{loadOrders:()=>ipcRenderer.invoke("media:get-orders"),onChanged(listener){const wrapped=(_event,payload)=>listener(payload);ipcRenderer.on("media:changed",wrapped);return()=>flag&&ipcRenderer.removeListener("media:changed",wrapped)}}}`,
      },
    ],
    [
      "preload conditional helper",
      {
        "/preload.ts": `import {ipcRenderer} from "./electron";export const desktopConsole={media:{loadOrders:()=>ipcRenderer.invoke("media:get-orders"),onChanged(listener){const wrapped=(_event,payload)=>listener(payload);ipcRenderer.on("media:changed",wrapped);function removeHelper(){return ipcRenderer.removeListener("media:changed",wrapped)}return()=>{if(flag)removeHelper()}}}}`,
      },
    ],
    [
      "feature",
      {
        "/event-feature.ts": `export function createEventFeature(deps){let disposeChanged=null;function start(){disposeChanged=deps.onChanged(()=>{})}function dispose(){if(flag)disposeChanged?.()}return{start,dispose}}`,
      },
    ],
    [
      "feature short-circuit",
      {
        "/event-feature.ts": `export function createEventFeature(deps){let disposeChanged=null;function start(){disposeChanged=deps.onChanged(()=>{})}function dispose(){flag&&disposeChanged?.()}return{start,dispose}}`,
      },
    ],
    [
      "feature conditional helper",
      {
        "/event-feature.ts": `export function createEventFeature(deps){let disposeChanged=null;function start(){disposeChanged=deps.onChanged(()=>{})}function cleanupHelper(){disposeChanged?.()}function dispose(){if(flag)cleanupHelper()}return{start,dispose}}`,
      },
    ],
  ];
  for (const [name, overrides] of cases) {
    const result = verify(eventFiles(overrides), eventFixture);
    assert.equal(result.ok, false, `${name}: ${result.reasons.join("\n")}`);
  }
});

test("single production evidence core rejects a Renderer owner only in an unused returned API", () => {
  const result = verify(
    eventFiles({
      "/entry.ts": `import { EventView } from "./event-view"; function createApi(){return{neverCalled(){EventView()}}}createApi();`,
    }),
    eventFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "consumer owner is not callable-reachable from the recorded renderer entry",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects an uncalled returned producer API", () => {
  const result = verify(
    eventFiles({
      "/producer-entry.ts": `import { emitChanged } from "./producer"; import { sendToRenderer } from "./application"; export function bootstrap(){function createApi(){return{fire(){emitChanged({send:sendToRenderer},{})}}}const api=createApi();function neverCalled(){api.fire()}void neverCalled}bootstrap();`,
    }),
    {
      ...eventFixture,
      productionCaller: {
        ...eventFixture.productionCaller,
        producerEntryOwner: "bootstrap",
      },
    },
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "event producer owner is not callable-reachable from the recorded production entry",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects a returned API member called only from an unreachable cross-module helper", () => {
  const result = verify(
    queryFiles({
      "/bootstrap.ts": `import {View} from "./view";function createApi(){return{neverCalled(){View()}}}export function bootstrap(){const api=createApi();function dead(){api.neverCalled()}void dead}`,
      "/entry.ts": `import {bootstrap} from "./bootstrap";bootstrap()`,
    }),
    queryFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "consumer owner is not callable-reachable from the recorded renderer entry",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects a Renderer owner wired only to an unrendered intrinsic handler", () => {
  const result = verify(
    queryFiles({
      "/entry.tsx": `import {View} from "./view";function Root(){void <button onClick={View}/>;return null}Root()`,
    }),
    {
      ...queryFixture,
      productionCaller: {
        ...queryFixture.productionCaller,
        consumer: {
          ...queryFixture.productionCaller.consumer,
          entrySource: "/entry.tsx",
        },
      },
    },
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "consumer owner is not callable-reachable from the recorded renderer entry",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects event application send hidden in an unused returned member", () => {
  const result = verify(
    eventFiles({
      "/application.ts": `const mainWindow={webContents:{send(_channel:string,_payload:unknown){}}};export function sendToRenderer(channel:string,payload:unknown){return{dead(){mainWindow.webContents.send(channel,payload)}}}`,
    }),
    eventFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "event application symbol is not the producer send call member",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects a consumer disposer not returned by the recorded subscription", () => {
  const result = verify(
    eventFiles({
      "/event-feature.ts": `export function createEventFeature(deps){function start(){deps.onChanged(()=>{})}return{start}}`,
      "/event-view.ts": `import {eventFeature} from "./event-composition";export function EventView(){const dispose=eventFeature.start();return()=>dispose()}`,
    }),
    eventFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "event feature does not dispose the recorded subscription",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects lifecycle snapshot wiring borrowed from an unreachable JSX instance", () => {
  const result = verify(
    queryFiles({
      "/view.ts": "",
      "/view.tsx": `import {feature} from "./composition";type Props={featureProp:typeof feature,snapshot:ReturnType<typeof feature.getSnapshot>};export function Child({featureProp,snapshot}:Props){featureProp.refresh();return <div>{snapshot.orders}</div>}export function Root(){const fake={orders:[]};return <Child featureProp={feature} snapshot={fake}/>}function Dead(){return <Child featureProp={feature} snapshot={feature.getSnapshot()}/>}void Dead`,
      "/entry.tsx": `import {Root} from "./view.tsx";const root={render(_value){}};root.render(<Root/>);`,
    }),
    {
      ...queryFixture,
      productionCaller: {
        ...queryFixture.productionCaller,
        consumer: {
          ...queryFixture.productionCaller.consumer,
          source: "/view.tsx",
          entrySource: "/entry.tsx",
          owner: "Child",
          receiver: "featureProp",
          stateSource: "/view.tsx",
          stateRoot: "snapshot",
          stateOwner: "Child",
        },
      },
    },
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "lifecycle snapshot consumer is not derived from the recorded feature snapshot",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects query result values discarded across the invoke chain", () => {
  const cases = [
    [
      "registrar",
      {
        "/registrar.ts": `export function register(ipcMain,application){ipcMain.handle("media:get-orders",async()=>{application.listOrderViews();return []})}`,
      },
      "query result is not returned by the registrar handler",
    ],
    [
      "preload",
      {
        "/preload.ts": `import {ipcRenderer} from "./electron";export const desktopConsole={media:{loadOrders:async()=>{ipcRenderer.invoke("media:get-orders");return []},onChanged(listener){const wrapped=(_event,payload)=>listener(payload);ipcRenderer.on("media:changed",wrapped);return()=>ipcRenderer.removeListener("media:changed",wrapped)}}};`,
      },
      "query result is not returned by the preload member",
    ],
    [
      "bridge",
      {
        "/bridge.ts": `import {desktopConsole} from "./preload";export async function loadOrders(){desktopConsole.media.loadOrders();return []}export function onChanged(listener){return desktopConsole.media.onChanged(listener)}`,
      },
      "query result is not returned by the bridge member",
    ],
  ];
  for (const [name, overrides, reason] of cases) {
    const result = verify(queryFiles(overrides), queryFixture);
    assert.equal(result.ok, false, `${name}: ${result.reasons.join("\n")}`);
    assert.ok(result.reasons.length > 0, `${name}: expected ${reason}`);
  }
});

test("single production evidence core rejects event payload and disposer breaks", () => {
  const cases = [
    [
      "preload payload",
      {
        "/preload.ts": `import {ipcRenderer} from "./electron";export const desktopConsole={media:{loadOrders:()=>ipcRenderer.invoke("media:get-orders"),onChanged(listener){const wrapped=(_event,payload)=>{void listener;void payload};ipcRenderer.on("media:changed",wrapped);return()=>ipcRenderer.removeListener("media:changed",wrapped)}}};`,
      },
      "event preload callback does not invoke the recorded listener",
    ],
    [
      "bridge disposer",
      {
        "/bridge.ts": `import {desktopConsole} from "./preload";export async function loadOrders(){return desktopConsole.media.loadOrders()}export function onChanged(listener){desktopConsole.media.onChanged(listener);return()=>{}}`,
      },
      "event subscription result is not returned by the bridge member",
    ],
    [
      "renderer lifecycle",
      {
        "/event-view.ts": `import {eventFeature} from "./event-composition";export function EventView(){eventFeature.dispose();eventFeature.start();return null}`,
      },
      "event cleanup is not ordered after the recorded subscription",
    ],
  ];
  for (const [name, overrides, reason] of cases) {
    const result = verify(eventFiles(overrides), eventFixture);
    assert.equal(result.ok, false, `${name}: ${result.reasons.join("\n")}`);
    assert.ok(result.reasons.length > 0, `${name}: expected ${reason}`);
  }
});

test("single production evidence core rejects evidence confined to an empty iterable", () => {
  const cases = [
    {
      name: "producer entry",
      overrides: {
        "/producer-entry.ts": `import{emitChanged}from"./producer";import{sendToRenderer}from"./application";for(const item of [])emitChanged({send:sendToRenderer},{});`,
      },
    },
    {
      name: "producer send",
      overrides: {
        "/producer.ts": `export function emitChanged(sender,payload){for(const item of [])sender.send("media:changed",payload)}`,
      },
    },
    {
      name: "renderer consumer",
      overrides: {
        "/event-view.ts": `import{eventFeature}from"./event-composition";export function EventView(){for(const item of [])eventFeature.start();eventFeature.dispose();return null}`,
      },
    },
    {
      name: "preload listener",
      overrides: {
        "/preload.ts": `import{ipcRenderer}from"./electron";export const desktopConsole={media:{loadOrders:()=>ipcRenderer.invoke("media:get-orders"),onChanged(listener){const wrapped=(_event,payload)=>{for(const item of [])listener(payload)};ipcRenderer.on("media:changed",wrapped);return()=>ipcRenderer.removeListener("media:changed",wrapped)}}}`,
      },
    },
    {
      name: "preload disposer",
      overrides: {
        "/preload.ts": `import{ipcRenderer}from"./electron";export const desktopConsole={media:{loadOrders:()=>ipcRenderer.invoke("media:get-orders"),onChanged(listener){const wrapped=(_event,payload)=>listener(payload);ipcRenderer.on("media:changed",wrapped);return()=>{for(const item of [])ipcRenderer.removeListener("media:changed",wrapped)}}}}`,
      },
    },
    {
      name: "feature disposer",
      overrides: {
        "/event-feature.ts": `export function createEventFeature(deps){let disposeChanged=null;function start(){disposeChanged=deps.onChanged(()=>{})}function dispose(){for(const item of [])disposeChanged?.()}return{start,dispose}}`,
      },
    },
    {
      name: "application send",
      overrides: {
        "/application.ts": `const mainWindow={webContents:{send(_channel:string,_payload:unknown){}}};export function sendToRenderer(channel:string,payload:unknown){for(const item of [])mainWindow.webContents.send(channel,payload)}`,
      },
    },
  ];
  for (const { name, overrides } of cases) {
    const result = verify(eventFiles(overrides), eventFixture);
    assert.equal(result.ok, false, `${name}: ${result.reasons.join("\n")}`);
  }
});

test("single production evidence core rejects query calls hidden by an empty array callback", () => {
  const result = verify(
    queryFiles({
      "/view.ts": `import{feature}from"./composition";export function View(){[].forEach(()=>feature.refresh());const snapshot=feature.getSnapshot();return snapshot.orders}`,
    }),
    queryFixture,
  );
  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(result.reasons.length > 0, result.reasons.join("\n"));
});

test("single production evidence core rejects query results erased by a wrapper", () => {
  const cases = [
    {
      name: "registrar",
      overrides: {
        "/registrar.ts": `function ignore(_value){return []}export function register(ipcMain,application){ipcMain.handle("media:get-orders",async()=>ignore(await application.listOrderViews()))}`,
      },
    },
    {
      name: "preload",
      overrides: {
        "/preload.ts": `import{ipcRenderer}from"./electron";function ignore(_value){return []}export const desktopConsole={media:{loadOrders:async()=>ignore(await ipcRenderer.invoke("media:get-orders")),onChanged(listener){const wrapped=(_event,payload)=>listener(payload);ipcRenderer.on("media:changed",wrapped);return()=>ipcRenderer.removeListener("media:changed",wrapped)}}}`,
      },
    },
    {
      name: "bridge",
      overrides: {
        "/bridge.ts": `import{desktopConsole}from"./preload";function ignore(_value){return []}export async function loadOrders(){return ignore(await desktopConsole.media.loadOrders())}export function onChanged(listener){return desktopConsole.media.onChanged(listener)}`,
      },
    },
    {
      name: "feature snapshot",
      overrides: {
        "/feature.ts": `function ignore(_value){return []}export function createFeature(deps){let snapshot={orders:[]};async function refresh(){snapshot={orders:ignore(await deps.loadOrders())}}return{refresh,getSnapshot:()=>snapshot}}`,
      },
    },
  ];
  for (const { name, overrides } of cases) {
    const result = verify(queryFiles(overrides), queryFixture);
    assert.equal(result.ok, false, `${name}: ${result.reasons.join("\n")}`);
  }
});

test("single production evidence core rejects query results overwritten before snapshot state", () => {
  const cases = [
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){let orders=await deps.loadOrders();orders=[];snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){let orders=await deps.loadOrders();orders+=[];snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){let orders=await deps.loadOrders();({orders}={orders:[]});snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
  ];
  for (const feature of cases) {
    const result = verify(queryFiles({ "/feature.ts": feature }), queryFixture);
    assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
    assert.ok(
      result.reasons.includes(
        "lifecycle query result does not reach the recorded snapshot field",
      ),
      result.reasons.join("\n"),
    );
  }
});

test("single production evidence core rejects query writes erased by a later snapshot replacement", () => {
  for (const feature of [
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){snapshot={orders:await deps.loadOrders()};snapshot={orders:[]}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){snapshot={orders:await deps.loadOrders()};({snapshot}={snapshot:{orders:[]}})}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){snapshot={orders:await deps.loadOrders()};({orders:snapshot.orders}={orders:[]})}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){snapshot={orders:await deps.loadOrders()};([...snapshot]=[{orders:[]}])}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){snapshot={orders:await deps.loadOrders()};([...snapshot.orders]=[[]])}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){snapshot={orders:await deps.loadOrders()};(snapshot).orders=[]}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){const key="orders";let snapshot={orders:[]};async function refresh(){snapshot={orders:await deps.loadOrders()};snapshot[key]=[]}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){snapshot={orders:await deps.loadOrders()};snapshot[unknownKey]=[]}return{refresh,getSnapshot:()=>snapshot}}`,
  ]) {
    const result = verify(queryFiles({ "/feature.ts": feature }), queryFixture);
    assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
    assert.ok(
      result.reasons.includes(
        "lifecycle query result does not reach the recorded snapshot field",
      ),
      result.reasons.join("\n"),
    );
  }
});

test("single production evidence core rejects branch-local query results with an untainted sibling", () => {
  for (const feature of [
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(flag){let orders;if(flag)orders=await deps.loadOrders();else orders=[];snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(flag){let orders;if(flag)orders=[];else orders=await deps.loadOrders();snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(flag){let orders=flag?await deps.loadOrders():[];snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(flag){let orders=flag?[]:await deps.loadOrders();snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){let orders=(await deps.loadOrders())||[];snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){let orders=(await deps.loadOrders())&&[];snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){let orders=(await deps.loadOrders())??[];snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){let orders=(await deps.loadOrders())?[]:[];snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(flag){let orders=flag?(await deps.loadOrders(),[]):[];snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){let orders=void(await deps.loadOrders());snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(flag){snapshot={orders:flag?await deps.loadOrders():[]}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){snapshot={orders:!(await deps.loadOrders())}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(flag){let raw=await deps.loadOrders();let orders=flag?raw:[];snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
  ]) {
    const result = verify(queryFiles({ "/feature.ts": feature }), queryFixture);
    assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
    assert.ok(
      result.reasons.includes(
        "lifecycle query result does not reach the recorded snapshot field",
      ),
      result.reasons.join("\n"),
    );
  }
});

test("single production evidence core accepts query value alternatives that all carry taint", () => {
  for (const feature of [
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(flag){let orders=flag?await deps.loadOrders():await deps.loadOrders();snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){let orders=(await deps.loadOrders())??(await deps.loadOrders());snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
  ]) {
    const result = verify(queryFiles({ "/feature.ts": feature }), queryFixture);
    assert.equal(result.ok, true, result.reasons.join("\n"));
  }
});

test("single production evidence core rejects structured and property aliases with incomplete query taint", () => {
  for (const feature of [
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(flag){const box={orders:flag?await deps.loadOrders():[]};snapshot={orders:box.orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){const box={orders:await deps.loadOrders()};box.orders=[];snapshot={orders:box.orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){const [orders,ignored]=[[],await deps.loadOrders()];snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){const {orders,ignored}={orders:[],ignored:await deps.loadOrders()};snapshot={orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};function helper(value){snapshot={orders:value}}async function refresh(){helper(await deps.loadOrders());helper([])}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(){const box={orders:[]};box.orders=!(await deps.loadOrders());snapshot={orders:box.orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(flag){const box={orders:[]};if(flag)box.orders=[];else box.orders=await deps.loadOrders();snapshot={orders:box.orders}}return{refresh,getSnapshot:()=>snapshot}}`,
    `export function createFeature(deps){let snapshot={orders:[]};async function refresh(flag){const box={orders:[]};if(flag)box.orders=await deps.loadOrders();snapshot={orders:box.orders}}return{refresh,getSnapshot:()=>snapshot}}`,
  ]) {
    const result = verify(queryFiles({ "/feature.ts": feature }), queryFixture);
    assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
    assert.ok(
      result.reasons.includes(
        "lifecycle query result does not reach the recorded snapshot field",
      ),
      result.reasons.join("\n"),
    );
  }
});

test("single production evidence core rejects snapshot reads that never reach an observable sink", () => {
  for (const view of [
    `import{feature}from"./composition";function ignore(_value){}export function View(){feature.refresh();const snapshot=feature.getSnapshot();ignore(snapshot.orders);return null}`,
    `import{feature}from"./composition";function ignore(_callback){}export function View(){feature.refresh();const snapshot=feature.getSnapshot();ignore(()=>snapshot.orders);return null}`,
    `import{feature}from"./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();return (snapshot.orders,null)}`,
    `import{feature}from"./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();return {orders:snapshot.orders,orders:null}}`,
    `import{feature}from"./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();return false&&snapshot.orders}`,
  ]) {
    const result = verify(queryFiles({ "/view.ts": view }), queryFixture);
    assert.equal(result.ok, false, result.reasons.join("\n"));
  }
});

test("single production evidence core rejects a returned snapshot object whose result is discarded by the production entry", () => {
  const result = verify(
    queryFiles({
      "/view.ts": `import{feature}from"./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();return {ignored:snapshot.orders}}`,
      "/entry.ts": `import{View}from"./view";View();`,
    }),
    queryFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "lifecycle snapshot field has no reachable production consumer",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects a snapshot field written only to a local non-escaping object", () => {
  const result = verify(
    queryFiles({
      "/view.ts": `import{feature}from"./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();const local={};local.ignored=snapshot.orders;return null}`,
    }),
    queryFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "lifecycle snapshot field has no reachable production consumer",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects snapshot values borrowed from another property path", () => {
  for (const view of [
    `import{feature}from"./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();const local={};local.ignored=snapshot.orders;return local.other}`,
    `import{feature}from"./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();const local={};local.ignored=snapshot.orders;local.ignored=null;return local}`,
  ]) {
    const result = verify(queryFiles({ "/view.ts": view }), queryFixture);
    assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
    assert.ok(
      result.reasons.includes(
        "lifecycle snapshot field has no reachable production consumer",
      ),
      result.reasons.join("\n"),
    );
  }
});

test("single production evidence core rejects a shadowed Object.freeze identity transform", () => {
  const result = verify(
    queryFiles({
      "/feature.ts": `export function createFeature(deps){const Object={freeze(_value){return []}};let snapshot={orders:[]};async function refresh(){snapshot={orders:Object.freeze(await deps.loadOrders())}}return{refresh,getSnapshot:()=>snapshot}}`,
    }),
    queryFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "lifecycle query result does not reach the recorded snapshot field",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects a snapshot read after a return-finally", () => {
  const result = verify(
    queryFiles({
      "/view.ts": `import{feature}from"./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();try{return null}finally{return null}return snapshot.orders}`,
    }),
    queryFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "lifecycle snapshot field has no reachable production consumer",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects a snapshot read after a throw-finally", () => {
  const result = verify(
    queryFiles({
      "/view.ts": `import{feature}from"./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();try{throw new Error("stop")}finally{return null}return snapshot.orders}`,
    }),
    queryFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "lifecycle snapshot field has no reachable production consumer",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core keeps a normal try-finally snapshot read reachable", () => {
  const result = verify(
    queryFiles({
      "/view.ts": `import{feature}from"./composition";export function View(){try{feature.refresh()}finally{cleanup()}const snapshot=feature.getSnapshot();return snapshot.orders}`,
    }),
    queryFixture,
  );

  assert.equal(result.ok, true, result.reasons.join("\n"));
});

test("single production evidence core rejects query and snapshot reads hidden by a static nullish optional chain", () => {
  for (const view of [
    `import{feature}from"./composition";export function View(){null?.[feature.refresh()];const snapshot=feature.getSnapshot();return snapshot.orders}`,
    `import{feature}from"./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();return null?.[snapshot.orders]}`,
    `import{feature}from"./composition";export function View(){let target=null;target?.[feature.refresh()];const snapshot=feature.getSnapshot();return snapshot.orders}`,
  ]) {
    const result = verify(queryFiles({ "/view.ts": view }), queryFixture);
    assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
    assert.ok(result.reasons.length > 0, result.reasons.join("\n"));
  }
});

test("single production evidence core rejects truthy values that short-circuit logical assignments", () => {
  for (const view of [
    `import{feature}from"./composition";export function View(){let ready=[];ready||=feature.refresh();const snapshot=feature.getSnapshot();return snapshot.orders}`,
    `import{feature}from"./composition";export function View(){({})||feature.refresh();const snapshot=feature.getSnapshot();return snapshot.orders}`,
  ]) {
    const result = verify(queryFiles({ "/view.ts": view }), queryFixture);
    assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
    assert.ok(result.reasons.length > 0, result.reasons.join("\n"));
  }
});

test("single production evidence core rejects snapshot taint across mutually exclusive sinks", () => {
  const result = verify(
    queryFiles({
      "/view.ts": `import{feature}from"./composition";export function View(flag){feature.refresh();const snapshot=feature.getSnapshot();const local={};if(flag){local.ignored=snapshot.orders;return null}else{return local}}`,
    }),
    queryFixture,
  );
  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(result.reasons.length > 0, result.reasons.join("\n"));
});

test("single production evidence core keeps nullish coalescing RHS reachable for undefined", () => {
  for (const view of [
    `import{feature}from"./composition";export function View(){undefined??feature.refresh();const snapshot=feature.getSnapshot();return snapshot.orders}`,
    `import{feature}from"./composition";export function View(){let ready=undefined;ready??=feature.refresh();const snapshot=feature.getSnapshot();return snapshot.orders}`,
  ]) {
    const result = verify(queryFiles({ "/view.ts": view }), queryFixture);
    assert.equal(result.ok, true, result.reasons.join("\n"));
  }
});

test("single production evidence core accepts callbacks from statically non-empty spread arrays", () => {
  for (const view of [
    `import{feature}from"./composition";export function View(){[...[1]].forEach(()=>feature.refresh());const snapshot=feature.getSnapshot();return snapshot.orders}`,
    `import{feature}from"./composition";export function View(){[...[1],...[2]].forEach(()=>feature.refresh());const snapshot=feature.getSnapshot();return snapshot.orders}`,
  ]) {
    const result = verify(queryFiles({ "/view.ts": view }), queryFixture);
    assert.equal(result.ok, true, result.reasons.join("\n"));
  }
});

test("single production evidence core rejects query calls hidden by static logical assignments", () => {
  for (const view of [
    `import{feature}from"./composition";export function View(){let ready=true;ready||=feature.refresh();const snapshot=feature.getSnapshot();return snapshot.orders}`,
    `import{feature}from"./composition";export function View(){let ready=false;ready&&=feature.refresh();const snapshot=feature.getSnapshot();return snapshot.orders}`,
    `import{feature}from"./composition";export function View(){let ready=1;ready??=feature.refresh();const snapshot=feature.getSnapshot();return snapshot.orders}`,
  ]) {
    const result = verify(queryFiles({ "/view.ts": view }), queryFixture);
    assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
    assert.ok(result.reasons.length > 0, result.reasons.join("\n"));
  }
});

test("single production evidence core rejects property and typeof short-circuit RHS", () => {
  for (const [index, view] of [
    `import{feature}from"./composition";export function View(){const flags={ready:false};flags.ready&&feature.refresh();const snapshot=feature.getSnapshot();return snapshot.orders}`,
    `import{feature}from"./composition";export function View(){const flags={ready:true};flags.ready||feature.refresh();const snapshot=feature.getSnapshot();return snapshot.orders}`,
    `import{feature}from"./composition";export function View(){const source={ready:true};const flags={...source,ready:false};flags.ready&&feature.refresh();const snapshot=feature.getSnapshot();return snapshot.orders}`,
    `import{feature}from"./composition";export function View(){[].length&&feature.refresh();const snapshot=feature.getSnapshot();return snapshot.orders}`,
    `import{feature}from"./composition";export function View(){typeof null==="string"&&feature.refresh();const snapshot=feature.getSnapshot();return snapshot.orders}`,
  ].entries()) {
    const result = verify(queryFiles({ "/view.ts": view }), queryFixture);
    assert.equal(
      result.ok,
      false,
      `case ${index}: ${JSON.stringify(result.trace, null, 2)}`,
    );
    assert.ok(
      result.reasons.length > 0,
      `case ${index}: ${result.reasons.join("\n")}`,
    );
  }
});

test("single production evidence core rejects snapshot values killed before the observable sink", () => {
  for (const view of [
    `import{feature}from"./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();let visible=snapshot.orders;visible=[];return visible}`,
    `import{feature}from"./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();const local={};local.ignored=snapshot.orders;return {...local,ignored:[]}}`,
    `import{feature}from"./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();const local={};local.ignored=snapshot.orders;delete local.ignored;return local}`,
    `import{feature}from"./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();let visible=snapshot.orders;visible+=[];return visible}`,
  ]) {
    const result = verify(queryFiles({ "/view.ts": view }), queryFixture);
    assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
    assert.ok(
      result.reasons.includes(
        "lifecycle snapshot field has no reachable production consumer",
      ),
      result.reasons.join("\n"),
    );
  }
});

test("single production evidence core rejects snapshot reads after a return caught by an empty catch", () => {
  const result = verify(
    queryFiles({
      "/view.ts": `import{feature}from"./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();try{return null}catch{}finally{cleanup()}return snapshot.orders}`,
    }),
    queryFixture,
  );

  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
  assert.ok(
    result.reasons.includes(
      "lifecycle snapshot field has no reachable production consumer",
    ),
    result.reasons.join("\n"),
  );
});

test("single production evidence core rejects snapshot reads after exhaustive switch and do-while paths", () => {
  for (const view of [
    `import{feature}from"./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();switch(1){case 1:return null;default:return null}return snapshot.orders}`,
    `import{feature}from"./composition";export function View(){feature.refresh();const snapshot=feature.getSnapshot();do{}while(true);return snapshot.orders}`,
  ]) {
    const result = verify(queryFiles({ "/view.ts": view }), queryFixture);
    assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
    assert.ok(
      result.reasons.includes(
        "lifecycle snapshot field has no reachable production consumer",
      ),
      result.reasons.join("\n"),
    );
  }
});

test("single production evidence core rejects cleanup in a mutually exclusive branch", () => {
  for (const view of [
    `import{eventFeature}from"./event-composition";export function EventView(flag){if(flag)eventFeature.start();else eventFeature.dispose();return null}`,
    `import{eventFeature}from"./event-composition";export function EventView(flag){switch(flag){case 1:eventFeature.start();break;case 2:eventFeature.dispose();break}return null}`,
    `import{eventFeature}from"./event-composition";export function EventView(){function startLater(){eventFeature.start()}function cleanupFirst(){eventFeature.dispose()}cleanupFirst();startLater();return null}`,
  ]) {
    const result = verify(eventFiles({ "/event-view.ts": view }), eventFixture);
    assert.equal(result.ok, false, result.reasons.join("\n"));
  }
});

test("single production evidence core rejects cleanup that does not cover every subscription path", () => {
  const cases = [
    `import{eventFeature}from"./event-composition";export function EventView(flag){eventFeature.start();if(flag)eventFeature.dispose();return null}`,
    `import{eventFeature}from"./event-composition";export function EventView(flag){eventFeature.start();if(flag)return null;eventFeature.dispose();return null}`,
    `import{eventFeature}from"./event-composition";export function EventView(items=[]){eventFeature.start();for(const item of items)eventFeature.dispose();return null}`,
    `import{eventFeature}from"./event-composition";export function EventView(flag){eventFeature.start();eventFeature.dispose();if(flag)eventFeature.start();return null}`,
    `import{eventFeature}from"./event-composition";export function EventView(flag){if(flag){eventFeature.start();return null}eventFeature.start();eventFeature.dispose();return null}`,
    `import{eventFeature}from"./event-composition";export function EventView(){eventFeature.start();eventFeature.start();eventFeature.dispose();return null}`,
    `import{eventFeature}from"./event-composition";export function EventView(items=[]){for(const item of items)eventFeature.start();eventFeature.dispose();return null}`,
    `import{eventFeature}from"./event-composition";export function EventView(n){eventFeature.start();if(n>0)EventView(n-1);eventFeature.dispose();return null}`,
    `import{eventFeature}from"./event-composition";function bounce(n){EventView(n-1)}export function EventView(n){eventFeature.start();bounce(n);eventFeature.dispose();return null}`,
    `import{eventFeature}from"./event-composition";export function EventView(n){eventFeature.start();[n].forEach((value)=>EventView(value-1));eventFeature.dispose();return null}`,
    `import{eventFeature}from"./event-composition";export function EventView(n){function again(value){EventView(value-1)}eventFeature.start();[n].forEach(again);eventFeature.dispose();return null}`,
    `import{eventFeature}from"./event-composition";function invoke(callback){callback()}export function EventView(n){function again(value){EventView(value-1)}eventFeature.start();invoke(again);eventFeature.dispose();return null}`,
    `import{eventFeature}from"./event-composition";function invoke(callback){callback()}export function EventView(n){function again(value){EventView(value-1)}const callback=again;eventFeature.start();invoke(callback);eventFeature.dispose();return null}`,
  ];
  for (const view of cases) {
    const result = verify(eventFiles({ "/event-view.ts": view }), eventFixture);
    assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
    assert.ok(
      result.reasons.includes(
        "event cleanup is not ordered after the recorded subscription",
      ),
      result.reasons.join("\n"),
    );
  }
});

test("single production evidence core accepts sequential subscriptions with individual cleanup", () => {
  const result = verify(
    eventFiles({
      "/event-view.ts": `import{eventFeature}from"./event-composition";export function EventView(){eventFeature.start();eventFeature.dispose();eventFeature.start();eventFeature.dispose();return null}`,
    }),
    eventFixture,
  );
  assert.equal(result.ok, true, result.reasons.join("\n"));
});

test("single production evidence core rejects callbacks that are statically not invoked", () => {
  const result = verify(
    eventFiles({
      "/event-view.ts": `import{eventFeature}from"./event-composition";function invokeIf(callback,enabled){if(enabled)callback()}export function EventView(){eventFeature.start();invokeIf(()=>EventView(),false);eventFeature.dispose();return null}`,
    }),
    eventFixture,
  );
  assert.equal(result.ok, false, JSON.stringify(result.trace, null, 2));
});

test("single production evidence core rejects callbacks behind a dynamic guard", () => {
  for (const view of [
    `import{eventFeature}from"./event-composition";function invokeIf(callback,enabled){if(enabled)callback()}function stop(){eventFeature.dispose()}export function EventView(){eventFeature.start();invokeIf(stop,flag);return null}`,
    `import{eventFeature}from"./event-composition";function invokeIf(callback,enabled){if(enabled)callback()}export function EventView(){eventFeature.start();invokeIf(()=>eventFeature.dispose(),flag);return null}`,
  ]) {
    const result = verify(eventFiles({ "/event-view.ts": view }), eventFixture);
    assert.equal(result.ok, false, result.reasons.join("\n"));
  }
});

test("single production evidence core accepts synchronous callback cleanup", () => {
  for (const view of [
    `import{eventFeature}from"./event-composition";function invoke(callback){callback()}export function EventView(){eventFeature.start();invoke(()=>eventFeature.dispose());return null}`,
    `import{eventFeature}from"./event-composition";export function EventView(){eventFeature.start();[1].forEach(()=>eventFeature.dispose());return null}`,
    `import{eventFeature}from"./event-composition";function invoke(callback){callback()}function stop(){eventFeature.dispose()}export function EventView(){eventFeature.start();invoke(stop);return null}`,
  ]) {
    const result = verify(eventFiles({ "/event-view.ts": view }), eventFixture);
    assert.equal(result.ok, true, result.reasons.join("\n"));
  }
});
