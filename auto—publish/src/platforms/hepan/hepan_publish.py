import argparse
import html
import json
import os
import random
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def cli_vendor_dir() -> str:
    try:
        index = sys.argv.index("--vendor-dir")
        return sys.argv[index + 1].strip()
    except (ValueError, IndexError):
        return ""


def add_vendor_paths() -> None:
    vendor_env = cli_vendor_dir() or os.environ.get("HEPAN_VENDOR_DIR", "").strip()
    candidates = []
    if vendor_env:
        candidates.append(Path(vendor_env))
    candidates.append(Path("D:/fenxi/vendor"))

    for candidate in candidates:
        if candidate.exists():
            sys.path.append(str(candidate))


add_vendor_paths()

import requests
from bs4 import BeautifulSoup


CATID = 121
SITE_ORIGIN = "https://www.hepan.com"
PORTAL_EDIT_URL = f"{SITE_ORIGIN}/portal.php?mod=portalcp&ac=article&catid={CATID}"
PORTAL_SUBMIT_URL = f"{SITE_ORIGIN}/portal.php?mod=portalcp&ac=article"
UPLOAD_URL = f"{SITE_ORIGIN}/misc.php?mod=swfupload&action=swfupload&operation=portal"

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".gif", ".bmp")
DOCX_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
MAX_PAYLOAD_BYTES = 5 * 1024 * 1024
MAX_TITLE_LENGTH = 200
MAX_CONTENT_HTML_LENGTH = 2 * 1024 * 1024
MAX_SOURCE_STEM_LENGTH = 255


class NeedsLoginError(RuntimeError):
    pass


class PayloadError(RuntimeError):
    def __init__(self, code: str, message: str = "Hepan payload is invalid") -> None:
        super().__init__(message)
        self.code = code


PAYLOAD_MESSAGES = {
    "HEPAN_PAYLOAD_NOT_FILE": "Hepan payload file is invalid",
    "HEPAN_PAYLOAD_TOO_LARGE": "Hepan payload is too large",
    "HEPAN_PAYLOAD_ENCODING_INVALID": "Hepan payload encoding is invalid",
    "HEPAN_PAYLOAD_JSON_INVALID": "Hepan payload JSON is invalid",
    "HEPAN_PAYLOAD_SHAPE_INVALID": "Hepan payload shape is invalid",
    "HEPAN_PAYLOAD_VALUE_INVALID": "Hepan payload value is invalid",
    "HEPAN_PAYLOAD_HTML_UNSAFE": "Hepan payload HTML is unsafe",
}


def read_payload(payload_path: Path) -> tuple[str, str, str]:
    try:
        stat = payload_path.lstat()
    except OSError:
        raise PayloadError("HEPAN_PAYLOAD_NOT_FILE", PAYLOAD_MESSAGES["HEPAN_PAYLOAD_NOT_FILE"])
    if not stat.is_file() or payload_path.is_symlink():
        raise PayloadError("HEPAN_PAYLOAD_NOT_FILE", PAYLOAD_MESSAGES["HEPAN_PAYLOAD_NOT_FILE"])
    if stat.st_size > MAX_PAYLOAD_BYTES:
        raise PayloadError("HEPAN_PAYLOAD_TOO_LARGE", PAYLOAD_MESSAGES["HEPAN_PAYLOAD_TOO_LARGE"])

    try:
        raw = payload_path.read_bytes()
        text = raw.decode("utf-8-sig")
    except (OSError, UnicodeDecodeError):
        raise PayloadError("HEPAN_PAYLOAD_ENCODING_INVALID", PAYLOAD_MESSAGES["HEPAN_PAYLOAD_ENCODING_INVALID"])
    try:
        payload = json.loads(text, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
    except (TypeError, ValueError, json.JSONDecodeError):
        raise PayloadError("HEPAN_PAYLOAD_JSON_INVALID", PAYLOAD_MESSAGES["HEPAN_PAYLOAD_JSON_INVALID"])
    if not isinstance(payload, dict) or set(payload) != {"title", "contentHtml", "sourceStem"}:
        raise PayloadError("HEPAN_PAYLOAD_SHAPE_INVALID", PAYLOAD_MESSAGES["HEPAN_PAYLOAD_SHAPE_INVALID"])

    title = payload["title"]
    content_html = payload["contentHtml"]
    source_stem = payload["sourceStem"]
    if not isinstance(title, str) or not isinstance(content_html, str) or not isinstance(source_stem, str):
        raise PayloadError("HEPAN_PAYLOAD_VALUE_INVALID", PAYLOAD_MESSAGES["HEPAN_PAYLOAD_VALUE_INVALID"])
    title = title.strip()
    content_html = content_html.strip()
    source_stem = source_stem.strip()
    if not title or len(title) > MAX_TITLE_LENGTH or not content_html or len(content_html) > MAX_CONTENT_HTML_LENGTH:
        raise PayloadError("HEPAN_PAYLOAD_VALUE_INVALID", PAYLOAD_MESSAGES["HEPAN_PAYLOAD_VALUE_INVALID"])
    if not source_stem or len(source_stem) > MAX_SOURCE_STEM_LENGTH or source_stem in {".", ".."} or "/" in source_stem or "\\" in source_stem or "\x00" in source_stem:
        raise PayloadError("HEPAN_PAYLOAD_VALUE_INVALID", PAYLOAD_MESSAGES["HEPAN_PAYLOAD_VALUE_INVALID"])
    if re.search(r"(?is)<\s*(?:script|iframe|object|embed|style)\b|\bon[a-z]+\s*=|(?:href|src)\s*=\s*['\"]?\s*(?:javascript|data|vbscript):", content_html):
        raise PayloadError("HEPAN_PAYLOAD_HTML_UNSAFE", PAYLOAD_MESSAGES["HEPAN_PAYLOAD_HTML_UNSAFE"])
    return title, content_html, source_stem


class HepanPortalPublisher:
    def __init__(self, cookie_value: str, category_id: int = CATID) -> None:
        self.cookie_value = cookie_value.strip()
        self.category_id = category_id
        self.formhash = ""
        self.uid_value = ""
        self.hash_value = ""

    def _base_headers(self) -> dict[str, str]:
        return {
            "accept-language": "zh-CN,zh;q=0.9",
            "cookie": self.cookie_value,
            "user-agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/123.0.0.0 Safari/537.36 QQBrowser/21.0.8335.400"
            ),
        }

    def load_publish_context(self) -> None:
        headers = {
            **self._base_headers(),
            "accept": (
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,"
                "image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"
            ),
            "cache-control": "max-age=0",
            "sec-ch-ua": '"Chromium";v="123", "Not:A-Brand";v="8"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
        }
        response = requests.get(f"{SITE_ORIGIN}/portal.php?mod=portalcp&ac=article&catid={self.category_id}", headers=headers, timeout=30)
        if response.status_code in (401, 403):
            raise NeedsLoginError(f"hepan cookie rejected with HTTP {response.status_code}")
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        formhash_tag = soup.find("input", {"name": "formhash"})
        if not formhash_tag or not formhash_tag.get("value"):
            raise NeedsLoginError("formhash not found; hepan cookie may be expired")
        self.formhash = formhash_tag["value"]

        pattern = re.compile(r'"uid"\s*:\s*"(\d+)"\s*,\s*"hash"\s*:\s*"([a-f0-9]+)"')
        uid_value = None
        hash_value = None
        for script in soup.find_all("script"):
            if script.string:
                match = pattern.search(script.string)
                if match:
                    uid_value, hash_value = match.group(1), match.group(2)
                    break
        if not uid_value or not hash_value:
            raise RuntimeError("image upload uid/hash not found")
        self.uid_value = uid_value
        self.hash_value = hash_value

    def upload_image(self, image_path: Path) -> str:
        if not self.uid_value or not self.hash_value:
            self.load_publish_context()

        payload = {
            "uid": self.uid_value,
            "hash": self.hash_value,
            "aid": 0,
            "catid": str(self.category_id),
            "id": "WU_FILE_0",
            "type": "image",
            "filetype": image_path.suffix,
        }
        headers = {
            **self._base_headers(),
            "accept": "*/*",
            "origin": SITE_ORIGIN,
            "sec-ch-ua": '"Chromium";v="123", "Not:A-Brand";v="8"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
        }
        with image_path.open("rb") as f:
            response = requests.post(
                f"{SITE_ORIGIN}/misc.php?mod=swfupload&action=swfupload&operation=portal",
                headers=headers,
                data=payload,
                files=[("Filedata", (image_path.name, f))],
                timeout=180,
            )
        if response.status_code in (401, 403):
            raise NeedsLoginError(f"hepan cookie rejected during image upload with HTTP {response.status_code}")
        response.raise_for_status()
        result = response.json()
        if "bigimg" not in result:
            raise RuntimeError(result.get("error", "image upload failed"))
        return result["bigimg"]

    def publish_article(self, title: str, content_html: str) -> str:
        if not self.formhash:
            self.load_publish_context()

        payload = {
            "title": title,
            "highlight_style[0]": "",
            "highlight_style[1]": "",
            "highlight_style[2]": "",
            "highlight_style[3]": "",
            "htmlname": "",
            "oldhtmlname": "",
            "pagetitle": "",
            "catid": self.category_id,
            "from": "",
            "fromurl": "",
            "dateline": "",
            "from_idtype": "tid",
            "from_id": 0,
            "id": 0,
            "idtype": "tid",
            "author": "",
            "url": "",
            "conver": "",
            "newalbum": "请输入相册名称",
            "view_albumid": "none",
            "content": content_html,
            "summary": "",
            "aid": "",
            "cid": "",
            "attach_ids": "",
            "articlesubmit": True,
            "formhash": self.formhash,
        }
        headers = {
            **self._base_headers(),
            "accept": (
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,"
                "image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"
            ),
            "cache-control": "max-age=0",
            "origin": SITE_ORIGIN,
            "sec-ch-ua": '"Chromium";v="123", "Not:A-Brand";v="8"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "same-origin",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
        }
        response = requests.post(
            f"{SITE_ORIGIN}/portal.php?mod=portalcp&ac=article",
            headers=headers,
            data=payload,
            files=[("file", (None, None))],
            timeout=180,
        )
        if response.status_code in (401, 403):
            raise NeedsLoginError(f"hepan cookie rejected during publish with HTTP {response.status_code}")
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        for link in soup.find_all("a", href=True):
            if "查看文章" in link.get_text(strip=True):
                return link["href"].replace("&amp;", "&")
        error_node = soup.select_one(".alert_error p")
        if error_node:
            raise RuntimeError(error_node.get_text(strip=True))
        raise RuntimeError("publish failed; article link not found in response")


def docx_run_to_html(run: ET.Element) -> str:
    parts = []
    run_props = run.find("w:rPr", DOCX_NS)
    is_bold = run_props is not None and run_props.find("w:b", DOCX_NS) is not None
    is_italic = run_props is not None and run_props.find("w:i", DOCX_NS) is not None
    is_underline = run_props is not None and run_props.find("w:u", DOCX_NS) is not None

    for child in run:
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "t":
            parts.append(html.escape(child.text or ""))
        elif tag == "tab":
            parts.append("&emsp;")
        elif tag in {"br", "cr"}:
            parts.append("<br />")

    text_html = "".join(parts)
    if not text_html:
        return ""
    if is_underline:
        text_html = f"<u>{text_html}</u>"
    if is_italic:
        text_html = f"<em>{text_html}</em>"
    if is_bold:
        text_html = f"<strong>{text_html}</strong>"
    return text_html


def read_docx_article(file_path: Path) -> tuple[str, str]:
    with zipfile.ZipFile(file_path) as archive:
        document_xml = archive.read("word/document.xml")

    root = ET.fromstring(document_xml)
    paragraphs = []
    for paragraph in root.findall(".//w:body/w:p", DOCX_NS):
        parts = []
        for node in paragraph:
            tag = node.tag.rsplit("}", 1)[-1]
            if tag == "r":
                parts.append(docx_run_to_html(node))
            elif tag == "hyperlink":
                for run in node.findall("w:r", DOCX_NS):
                    parts.append(docx_run_to_html(run))
        paragraph_html = "".join(parts).strip()
        if paragraph_html:
            paragraphs.append(paragraph_html)

    if not paragraphs:
        return "", ""

    title = BeautifulSoup(paragraphs[0], "html.parser").get_text(strip=True)
    body_html = "\n".join(
        f'<p style="text-indent: 2em;">{paragraph}</p>' for paragraph in paragraphs[1:] if paragraph
    )
    return title, body_html


def find_cover_image(image_dir: Path, stem: str) -> Path | None:
    for ext in IMAGE_EXTS:
        candidate = image_dir / f"{stem}{ext}"
        if candidate.exists():
            return candidate
    return None


def insert_image_between_paragraphs(content_html: str, image_url: str) -> str:
    image_html = f'<p><img src="{image_url}" /></p>'
    soup = BeautifulSoup(content_html, "html.parser")
    paragraphs = soup.find_all("p")
    if not paragraphs:
        return image_html + content_html
    random.choice(paragraphs).insert_after(BeautifulSoup(image_html, "html.parser"))
    return str(soup)


def load_cookie(cookie_path: Path) -> str:
    if not cookie_path.exists():
        raise NeedsLoginError("hepan cookie file not found")
    try:
        cookie = cookie_path.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeDecodeError):
        raise NeedsLoginError("hepan cookie file is invalid")
    if not cookie:
        raise NeedsLoginError("cookie file is empty")
    return cookie


def publish_one(article_path: Path | None, image_dir: Path, cookie_path: Path, category_id: int, payload_path: Path | None = None) -> dict:
    if payload_path is not None:
        title, content_html, source_stem = read_payload(payload_path)
    else:
        if article_path is None or article_path.suffix.lower() != ".docx":
            raise PayloadError("HEPAN_ARTICLE_INVALID", "Hepan article input is invalid")
        title, content_html = read_docx_article(article_path)
        source_stem = article_path.stem
        if not title:
            raise PayloadError("HEPAN_ARTICLE_EMPTY_TITLE", "Hepan article title is empty")
        if not content_html:
            raise PayloadError("HEPAN_ARTICLE_EMPTY_BODY", "Hepan article body is empty")

    cookie_value = load_cookie(cookie_path)
    publisher = HepanPortalPublisher(cookie_value, category_id)

    cover_image = find_cover_image(image_dir, source_stem)
    image_url = ""
    if cover_image:
        image_url = publisher.upload_image(cover_image)
        content_html = insert_image_between_paragraphs(content_html, image_url)

    article_url = publisher.publish_article(title, content_html)
    return {
        "ok": True,
        "title": title,
        "url": article_url,
        "image": str(cover_image) if cover_image else "",
        "imageUrl": image_url,
    }


def check_login(cookie_path: Path, category_id: int) -> dict:
    cookie_value = load_cookie(cookie_path)
    publisher = HepanPortalPublisher(cookie_value, category_id)
    publisher.load_publish_context()
    return {"ok": True}


def print_json(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--article")
    parser.add_argument("--payload-path")
    parser.add_argument("--image-dir", required=True)
    parser.add_argument("--cookie-path", required=True)
    parser.add_argument("--check-login", action="store_true")
    parser.add_argument("--category-id", type=int, default=CATID)
    parser.add_argument("--vendor-dir")
    args = parser.parse_args()

    try:
        cookie_path = Path(args.cookie_path)
        if args.check_login:
            if args.article or args.payload_path:
                raise PayloadError("HEPAN_ARGUMENT_INVALID", "Hepan arguments are invalid")
            print_json(check_login(cookie_path, args.category_id))
            return 0

        if bool(args.article) == bool(args.payload_path):
            raise PayloadError("HEPAN_ARGUMENT_INVALID", "Hepan article input is required")

        result = publish_one(Path(args.article) if args.article else None, Path(args.image_dir), cookie_path, args.category_id, Path(args.payload_path) if args.payload_path else None)
        print_json(result)
        return 0
    except NeedsLoginError as exc:
        print_json({"ok": False, "needsLogin": True, "error": str(exc)})
        return 0
    except PayloadError as exc:
        print_json({"ok": False, "errorCode": exc.code, "error": str(exc)})
        return 1
    except Exception as exc:
        print_json({"ok": False, "errorCode": "HEPAN_PUBLISH_FAILED", "error": "Hepan publish failed"})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
