const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const script = path.resolve(__dirname, "..", "src", "platforms", "hepan", "hepan_publish.py");

describe("Hepan capability checks", () => {
  it("extracts the account from the current yonghuming theme container", () => {
    const code = String.raw`
import importlib.util
spec = importlib.util.spec_from_file_location("hepan_publish", r"${script.replace(/\\/g, "\\\\")}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class Response:
    status_code = 200
    url = "https://www.hepan.com/portal.php?mod=portalcp&ac=article&catid=121"
    history = []
    text = '''<html><body>
      <div id="toptb"><strong class="yonghuming"><a href="home.php?mod=space&uid=987654321">fixture-user</a></strong></div>
      <div class="avatar"><a href="home.php?mod=space&uid=987654321"><img src="avatar.jpg"></a></div>
      <nav><a href="home.php?mod=space&uid=987654321">我的空间</a></nav>
      <form action="portal.php?mod=portalcp&ac=article&catid=121"><input name="formhash" value="safe-formhash"></form>
    </body></html>'''
    def raise_for_status(self): pass
class Requests:
    def get(self, *args, **kwargs): return Response()
module.requests = Requests()
result = module.check_capabilities_from_cookie("sid=fixture", 121, include_upload=False)
assert result["authenticated"] is True
assert result["publishAccess"] is True
assert result["code"] == "HEPAN_AUTH_OK"
assert result["account"] == {"displayName": "fixture-user", "uid": "987654321"}
print("ok")
`;
    const result = spawnSync("python", ["-c", code], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.trim(), "ok");
  });

  it("accepts an authenticated publish page with generic login words and no upload token", () => {
    const code = String.raw`
import importlib.util
spec = importlib.util.spec_from_file_location("hepan_publish", r"${script.replace(/\\/g, "\\\\")}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class Response:
    status_code = 200
    url = "https://www.hepan.com/portal.php?mod=portalcp&ac=article&catid=121"
    history = []
    text = '''<html><head><script>window.loginHelper = true;</script></head><body>
      <nav>登录</nav>
      <div id="um"><strong class="vwmy"><a href="https://www.hepan.com/home.php?mod=space&uid=2093208">fixture-user</a></strong></div>
      <a href="home.php?mod=space&uid=2093208">我的空间</a>
      <form action="portal.php?mod=portalcp&ac=article&catid=121"><input name="formhash" value="safe-formhash"></form>
    </body></html>'''
    def raise_for_status(self): pass
class Requests:
    def get(self, *args, **kwargs): return Response()
module.requests = Requests()
result = module.check_capabilities_from_cookie("sid=fixture", 121, include_upload=True)
assert result["authenticated"] is True
assert result["publishAccess"] is True
assert result["uploadContext"] == "changed"
assert result["code"] == "HEPAN_AUTH_OK"
assert result["warnings"] == ["HEPAN_UPLOAD_CONTEXT_CHANGED"]
assert "errorCode" not in result
assert result["account"] == {"displayName": "fixture-user", "uid": "2093208"}
print("ok")
`;
    const result = spawnSync("python", ["-c", code], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.trim(), "ok");
  });

  it("rejects a real login form and explicit login route", () => {
    const code = String.raw`
import importlib.util
spec = importlib.util.spec_from_file_location("hepan_publish", r"${script.replace(/\\/g, "\\\\")}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class Response:
    status_code = 200
    url = "https://www.hepan.com/member.php?mod=logging&action=login"
    history = []
    text = '<form action="member.php?mod=logging&action=login"><input type="password" name="password"><button type="submit">登录</button></form>'
    def raise_for_status(self): pass
class Requests:
    def get(self, *args, **kwargs): return Response()
module.requests = Requests()
result = module.check_capabilities_from_cookie("sid=fixture", 121, include_upload=False)
assert result["authenticated"] is False
assert result["errorCode"] == "HEPAN_AUTH_REDIRECTED"
print("ok")
`;
    const result = spawnSync("python", ["-c", code], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.trim(), "ok");
  });

  it("reports authentication independently of a missing publish form", () => {
    const code = String.raw`
import importlib.util
spec = importlib.util.spec_from_file_location("hepan_publish", r"${script.replace(/\\/g, "\\\\")}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class Response:
    status_code = 200
    url = "https://www.hepan.com/portal.php?mod=portalcp&ac=article&catid=121"
    history = []
    text = '<div id="um"><strong class="vwmy"><a href="home.php?mod=space&uid=2093208">fixture-user</a></strong></div><p>栏目无权限</p>'
    def raise_for_status(self): pass
class Requests:
    def get(self, *args, **kwargs): return Response()
module.requests = Requests()
result = module.check_authentication("sid=fixture", 121)
assert result["ok"] is True and result["authenticated"] is True
assert result["account"]["uid"] == "2093208"
print("ok")
`;
    const result = spawnSync("python", ["-c", code], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.trim(), "ok");
  });

  it("ignores avatar and navigation space links without a trusted account container", () => {
    const code = String.raw`
import importlib.util
spec = importlib.util.spec_from_file_location("hepan_publish", r"${script.replace(/\\/g, "\\\\")}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.ensure_dependencies()
soup = module.BeautifulSoup('''
  <div class="avatar"><a href="home.php?mod=space&uid=987654321"><img src="avatar.jpg"></a></div>
  <nav><a href="home.php?mod=space&uid=987654321">我的空间</a></nav>
''', "html.parser")
assert module.extract_account_identity(soup) is None
print("ok")
`;
    const result = spawnSync("python", ["-c", code], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.trim(), "ok");
  });

  it("rejects invalid trusted account candidates and ordinary space links", () => {
    const code = String.raw`
import importlib.util
spec = importlib.util.spec_from_file_location("hepan_publish", r"${script.replace(/\\/g, "\\\\")}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.ensure_dependencies()
cases = [
    ("empty name", '<div id="toptb"><strong class="yonghuming"><a href="home.php?mod=space&uid=1"></a></strong></div>'),
    ("overlong name", f'<div id="toptb"><strong class="yonghuming"><a href="home.php?mod=space&uid=2">{"a" * 81}</a></strong></div>'),
    ("control-only name", f'<div id="toptb"><strong class="yonghuming"><a href="home.php?mod=space&uid=3">{chr(7)}</a></strong></div>'),
    ("nonnumeric uid", '<div id="toptb"><strong class="yonghuming"><a href="home.php?mod=space&uid=not-a-number">fixture-user</a></strong></div>'),
    ("ordinary space links", '''
      <div class="content"><a href="home.php?mod=space&uid=4">我的空间</a></div>
      <div class="content"><a href="home.php?mod=space&uid=5">用户设置</a></div>
      <div class="content"><a href="home.php?mod=space&uid=6">退出</a></div>
    ''')
]
for label, markup in cases:
    soup = module.BeautifulSoup(markup, "html.parser")
    account = module.extract_account_identity(soup)
    assert account is None, (label, account)
print("ok")
`;
    const result = spawnSync("python", ["-c", code], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.trim(), "ok");
  });

  it("keeps a successful capability check when account identity is unavailable", () => {
    const code = String.raw`
import importlib.util
spec = importlib.util.spec_from_file_location("hepan_publish", r"${script.replace(/\\/g, "\\\\")}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class Response:
    status_code = 200
    url = "https://www.hepan.com/portal.php?mod=portalcp&ac=article&catid=121"
    history = []
    text = '<html><body><form action="portal.php?mod=portalcp&ac=article&catid=121"><input name="formhash" value="safe-formhash"></form></body></html>'
    def raise_for_status(self): pass
class Requests:
    def get(self, *args, **kwargs): return Response()
module.requests = Requests()
result = module.check_capabilities_from_cookie("sid=fixture", 121, include_upload=False)
assert result["authenticated"] is True
assert result["publishAccess"] is True
assert result["code"] == "HEPAN_AUTH_OK"
assert "account" not in result
assert "errorCode" not in result
print("ok")
`;
    const result = spawnSync("python", ["-c", code], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.trim(), "ok");
  });

  it("keeps category denial and changed publish forms distinct from cookie rejection", () => {
    const code = String.raw`
import importlib.util
spec = importlib.util.spec_from_file_location("hepan_publish", r"${script.replace(/\\/g, "\\\\")}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class Response:
    status_code = 200
    url = "https://www.hepan.com/portal.php"
    def __init__(self, text): self.text = text
    def raise_for_status(self): pass
class Requests:
    def __init__(self, text): self.text = text
    def get(self, *args, **kwargs): return Response(self.text)
module.requests = Requests('<html><body>无权限</body></html>')
denied = module.check_capabilities_from_cookie("sid=fixture", 121, False)
assert denied["authenticated"] is True and denied["errorCode"] == "HEPAN_CATEGORY_ACCESS_DENIED"
module.requests = Requests('<html><body>欢迎回来</body></html>')
changed = module.check_capabilities_from_cookie("sid=fixture", 121, False)
assert changed["authenticated"] is True and changed["errorCode"] == "HEPAN_PUBLISH_FORM_CHANGED"
assert module.normalize_cookie("\n Cookie: sid=a=b; cn=%E4%B8%AD\n") == "sid=a=b; cn=%E4%B8%AD"
try: module.normalize_cookie("sid=ok\r\nX-Injected: 1")
except module.HepanCheckError: pass
else: raise AssertionError("CRLF was accepted")
print("ok")
`;
    const result = spawnSync("python", ["-c", code], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.trim(), "ok");
  });
});
