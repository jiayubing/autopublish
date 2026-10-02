const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("../media-workbench/node_modules/esbuild");
const { chromium } = require("playwright");

test("large article groups page actual DOM rows while preserving group selection and article actions", async () => {
  const bundle = await build({
    stdin: { resolveDir: path.resolve(__dirname, "../media-workbench"), loader: "tsx", contents: `
      import React, {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import List from './src/components/content/GeneratedArticlesList';
      const articles = Array.from({length: 1234}, (_, i) => ({id:'a'+i, clientId:'c', title:'Synthetic '+i, status:'generated'}));
      const groups = [{key:'g', label:'Synthetic group', platform:'test', templateSnapshot:null, articles}];
      const workflow = new Map(articles.map(a=>[a.id,{stage:'pending_submission',label:'待投稿'}]));
      function App(){
        const [selected,setSelected] = useState([]);
        const [collapsed,setCollapsed] = useState({});
        const [opened,setOpened] = useState('');
        const [empty,setEmpty] = useState(false);
        const [error,setError] = useState('');
        return <><output>{selected.length} selected / {opened}</output>
          <button onClick={()=>setEmpty(v=>!v)}>Toggle empty</button>
          <button onClick={()=>setError('Synthetic failure')}>Fail</button>
          <List groups={empty?[]:groups} visibleError={error} clientId="c" collapsed={collapsed} selected={selected}
            workflowByArticle={workflow} publishedArchives={[]} publishedView={false} isArticleSelectable={()=>true}
            isArticleSubmittable={()=>true} removalSubmitDisabled={false} commandBusy={()=>false}
            onToggleCollapsed={key=>setCollapsed(v=>({...v,[key]:v[key]===false}))}
            onToggleGroup={rows=>setSelected(v=>v.length===rows.length?[]:rows.map(a=>'c\\0'+a.id))}
            onToggleArticle={a=>setSelected(v=>v.includes('c\\0'+a.id)?v.filter(k=>k!=='c\\0'+a.id):[...v,'c\\0'+a.id])}
            onOpenArticle={a=>setOpened(a.id)} onOpenPublication={a=>setOpened('publication:'+a.id)}/></>;
      }
      createRoot(document.getElementById('root')).render(<App/>);
    ` }, bundle: true, write: false, format: "iife", define: { "process.env.NODE_ENV": '"production"' },
  });
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole("button", { name: /test · Synthetic group/ }).click();
    assert.equal(await page.getByRole("checkbox", { name: /^选择 / }).count(), 50);
    assert.equal(await page.getByRole("button", { name: "上一页", exact: true }).isDisabled(), true);
    await page.getByRole("checkbox", { name: "全选 Synthetic group", exact: true }).check();
    assert.match(await page.locator("output").textContent(), /^1234 selected/);
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await page.getByRole("checkbox", { name: "选择 Synthetic 50", exact: true }).waitFor();
    assert.equal(await page.getByRole("checkbox", { name: "选择 Synthetic 50", exact: true }).isChecked(), true);
    await page.getByRole("checkbox", { name: "选择 Synthetic 50", exact: true }).uncheck();
    assert.match(await page.locator("output").textContent(), /^1233 selected/);
    await page.getByRole("button", { name: /^Synthetic 50阶段/ }).click();
    assert.match(await page.locator("output").textContent(), /a50$/);
    for (let i = 2; i < 25; i++) await page.getByRole("button", { name: "下一页", exact: true }).click();
    assert.equal(await page.getByRole("checkbox", { name: /^选择 / }).count(), 34);
    assert.equal(await page.getByRole("button", { name: "下一页", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "Toggle empty" }).click();
    await page.getByText("暂无文章", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Fail", exact: true }).click();
    assert.equal(await page.getByText("暂无文章", { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
