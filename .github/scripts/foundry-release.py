"""Register a verified, published VE Mobile release in Foundry's directory.

GitHub continues to host the assets. This script only submits release metadata;
it never publishes a GitHub release, changes compatibility, or edits old assets.
"""

import argparse
import hashlib
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import zipfile


REPOSITORY = "Silvestrae/ve-mobile"
RELEASE_ROOT = f"https://github.com/{REPOSITORY}/releases"
FOUNDRY_ENDPOINT = "https://foundryvtt.com/_api/packages/release_version/"
STABLE_TAG = re.compile(r"v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)")


def require(condition, message):
    """Stop before submission when a release invariant is not satisfied."""
    if not condition:
        raise ValueError(message)


def download(url):
    """Read public GitHub metadata/assets without sending the Foundry token."""
    request = urllib.request.Request(url, headers={"User-Agent": "ve-mobile-release"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def verify_release(tag):
    """Check the published manifest and ZIP against their release checksums.

    All URLs are constructed for this repository and exact stable tag. Compatibility
    comes from the hashed release manifest, never from the current development tree.
    """
    require(STABLE_TAG.fullmatch(tag), "Use a stable release tag such as v1.2.1.")
    release = json.loads(download(f"https://api.github.com/repos/{REPOSITORY}/releases/tags/{tag}"))
    require(release.get("tag_name") == tag, "GitHub returned a different release tag.")
    require(release.get("draft") is False and release.get("prerelease") is False
            and release.get("published_at"), "Only published stable releases can be registered.")

    asset_root = f"{RELEASE_ROOT}/download/{tag}"
    zip_name = f"ve-mobile-{tag}.zip"
    asset_names = ("module.json", zip_name, "SHA256SUMS.txt")
    assets = release.get("assets", [])
    for name in asset_names:
        matches = [asset for asset in assets if asset.get("name") == name]
        require(len(matches) == 1 and matches[0].get("state") == "uploaded"
                and matches[0].get("browser_download_url") == f"{asset_root}/{name}",
                f"Missing or unexpected published asset: {name}")

    # Check both downloads; checksums alone must not hide a mismatched ZIP manifest.
    checksums = {}
    for line in download(f"{asset_root}/SHA256SUMS.txt").decode("utf-8").splitlines():
        if not line.strip():
            continue
        match = re.fullmatch(r"([a-fA-F0-9]{64}) [ *](.+)", line)
        require(match is not None, "Malformed SHA256SUMS.txt entry.")
        digest, name = match.groups()
        require(name not in checksums, "Duplicate SHA256SUMS.txt entry.")
        checksums[name] = digest.lower()
    contents = {}
    for name in ("module.json", zip_name):
        contents[name] = download(f"{asset_root}/{name}")
        require(hashlib.sha256(contents[name]).hexdigest() == checksums.get(name),
                f"Missing or mismatched SHA-256 for {name}.")
    with zipfile.ZipFile(io.BytesIO(contents[zip_name])) as archive:
        require(archive.namelist().count("module.json") == 1,
                "The ZIP must contain exactly one root module.json.")
        require(archive.read("module.json") == contents["module.json"],
                "The ZIP and standalone manifests differ.")

    manifest = json.loads(contents["module.json"])
    require(manifest.get("id") == "ve-mobile", "Unexpected package ID.")
    require(manifest.get("version") == tag[1:], "Manifest version does not match the release tag.")
    require(manifest.get("download") == f"{asset_root}/{zip_name}", "Unexpected ZIP download URL.")
    require(manifest.get("manifest") == f"{RELEASE_ROOT}/latest/download/module.json",
            "Unexpected stable update manifest URL.")
    compatibility = manifest.get("compatibility")
    require(isinstance(compatibility, dict), "Missing Foundry compatibility.")
    for field in ("minimum", "verified"):
        require(isinstance(compatibility.get(field), str) and compatibility[field].strip(),
                f"Missing Foundry compatibility.{field}.")
    if "maximum" in compatibility:
        require(isinstance(compatibility["maximum"], str), "Invalid compatibility.maximum.")
    # The API wants the version-specific manifest, unlike the stable update URL above.
    return {"id": "ve-mobile", "release": {
        "version": manifest["version"], "manifest": f"{asset_root}/module.json",
        "notes": f"{RELEASE_ROOT}/tag/{tag}",
        "compatibility": {key: compatibility[key] for key in ("minimum", "verified", "maximum")
                          if key in compatibility},
    }}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never forward the package token if the Foundry endpoint redirects."""

    def redirect_request(self, request, response, code, message, headers, new_url):
        """Treat redirects as errors instead of forwarding authorization."""
        return None


def submit(payload, token, dry_run):
    """Submit once, with one bounded retry only for an explicit rate-limit rejection.

    Other failures may have an uncertain write outcome, so they require inspection
    rather than an automatic replay. Server error details are redacted before logging.
    """
    body = json.dumps({**payload, "dry-run": dry_run}).encode("utf-8")
    request = urllib.request.Request(FOUNDRY_ENDPOINT, data=body, method="POST", headers={
        "Content-Type": "application/json", "Authorization": token,
        "User-Agent": "ve-mobile-release",
    })
    opener = urllib.request.build_opener(NoRedirect())
    for attempt in range(2):
        try:
            with opener.open(request, timeout=60) as response:
                result = json.load(response)
            require(result.get("status") == "success", "Foundry did not confirm success; inspect the directory before retrying.")
            return
        except urllib.error.HTTPError as error:
            retry_after = error.headers.get("Retry-After", "60")
            if error.code == 429 and attempt == 0 and retry_after.isdigit() and int(retry_after) <= 120:
                time.sleep(max(1, int(retry_after)) + 1)
                continue
            detail = error.read(4000).decode("utf-8", errors="replace").replace(token, "[redacted]")
            raise RuntimeError(f"Foundry HTTP {error.code}: {json.dumps(detail)}. Inspect the directory before retrying.") from None


def run(tag, mode):
    """Verify downloads first; a real registration always follows a successful dry run."""
    require(mode in ("verify", "dry-run", "publish"), "Unknown release mode.")
    payload = verify_release(tag)
    print(f"Verified {tag}: published assets, SHA-256 hashes, ZIP manifest and compatibility.")
    if mode == "verify":
        return
    token = os.environ.get("FOUNDRY_RELEASE_TOKEN", "").strip()
    require(token.startswith("fvttp_") and len(token) > len("fvttp_"),
            "Add the FOUNDRY_RELEASE_TOKEN repository Actions secret, including its fvttp_ prefix.")
    submit(payload, token, dry_run=True)
    print(f"Foundry dry-run passed for {tag}.")
    if mode == "publish":
        # Foundry rate-limits submissions for the same package within 60 seconds.
        time.sleep(61)
        submit(payload, token, dry_run=False)
        print(f"Registered {tag} at https://foundryvtt.com/packages/ve-mobile/.")


def main():
    """Expose read-only verification by default for local checks and manual recovery."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--mode", choices=("verify", "dry-run", "publish"), default="verify")
    arguments = parser.parse_args()
    try:
        run(arguments.tag, arguments.mode)
    except Exception as error:
        # Do not print a traceback or request object containing authorization data.
        token = os.environ.get("FOUNDRY_RELEASE_TOKEN", "")
        message = str(error).replace(token, "[redacted]") if token else str(error)
        print(f"Release registration failed: {message}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
