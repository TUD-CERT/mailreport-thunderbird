#!/usr/bin/env python3
"""
Plugin project build script

Used to build the plugin for development or to produce a 
distribution-ready xpi archive. Can also clean up after itself.
"""

import argparse
import collections.abc
import json
import os
import shutil
import subprocess
import sys
from typing import Dict
import zipfile

DEFAULTS_TPL = "templates/defaults.tpl"
LOCALES_TPL = "templates/locales"
MANIFEST_TPL = "templates/manifest.tpl"
OUT_BUILD_PATH = "build"
OUT_DIST_PATH = "dist"


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser()
  subparsers = parser.add_subparsers(dest="cmd", required=True, title="subcommands")
  parser_build = subparsers.add_parser("build", aliases=["b"], help="Builds the plugin in build/")
  parser_build.add_argument("config", help="Deployment configuration to use during build")
  parser_build.add_argument("-d", "--dist", action="store_true", help="Creates a distribution-ready plugin archive in dist/")
  parser_build.set_defaults(cmd="build")
  parser_dev = subparsers.add_parser("dev", help="Builds the plugin in build/ and watches for further changes")
  parser_dev.add_argument("config", help="Deployment configuration to use during build")
  parser_dev.set_defaults(cmd="dev")
  parser_clean = subparsers.add_parser("clean", aliases=["c"], help="Cleans up all build artifacts")
  parser_clean.set_defaults(cmd="clean")
  return parser.parse_args()


def quit(msg: str) -> None:
  """Shortcut to quit from anywhere and display an error message."""
  print(f"Error: {msg}")
  sys.exit(1)


def parse_json_from_file(path: str) -> Dict:
  """Attempts to parse JSON from path, returns the result."""
  with open(path, "r") as f:
    try:
      result = json.load(f)
    except json.decoder.JSONDecodeError:
      quit(f"Invalid JSON document: {path}")
  return result


def write_json_to_file(data: Dict, path: str) -> None:
  """Converts data to JSON and writes it to path."""
  print(f"Writing {path}")
  with open(path, "w") as f:
    json.dump(data, f)


def update_template(template: Dict, overrides: Dict) -> Dict:
  """Performs a deep update of template dict with values from overrides. Returns the updated template."""
  for key, value in overrides.items():
    if isinstance(value, collections.abc.Mapping):
      template[key] = update_template(template.get(key, {}), value)
    else:
      template[key] = value
  return template


def create_manifest(template: Dict, overrides: Dict, config: Dict) -> Dict:
  """Returns a manifest dict depending on the given overrides and configuration."""
  manifest = update_template(template, overrides)
  action = "browser_action" if config["use_toolbar_button"] else "message_display_action"
  manifest[action] = manifest.pop("action")
  manifest[action]["type"] = "menu" if config["spam_report_enabled"] else "button"
  return manifest


def make_build(config: str) -> str:
  """Parses the given deployment configuration (a directory) to create all required plugin components in ./build/.
  Returns a plugin id according to the generated manifest."""
  config_path = f"configs/{config}"
  if not os.path.isdir(config_path):
    quit(f"The deployment configuration directory ({config_path}) does not exist")
  os.makedirs(OUT_BUILD_PATH, exist_ok=True)
  print(f"Build path: {OUT_BUILD_PATH}")
  overrides = parse_json_from_file(f"{config_path}/overrides.json")
  defaults_tpl = parse_json_from_file(DEFAULTS_TPL)
  manifest_tpl = parse_json_from_file(MANIFEST_TPL)
  # Combine template with overrides to create manifest.json and defaults.json
  defaults = update_template(defaults_tpl, overrides.get("defaults", {}))
  manifest = create_manifest(manifest_tpl, overrides.get("manifest", {}), defaults)
  write_json_to_file(defaults, f"{OUT_BUILD_PATH}/defaults.json")
  write_json_to_file(manifest, f"{OUT_BUILD_PATH}/manifest.json")
  # Combine l18n templates and overrides to create locales
  locales_path = f"{OUT_BUILD_PATH}/_locales"
  for language in os.listdir(LOCALES_TPL):
    os.makedirs(f"{locales_path}/{language}", exist_ok=True)
    messages_tpl = parse_json_from_file(f"{LOCALES_TPL}/{language}/messages.json")
    messages = update_template(messages_tpl, overrides.get("locales", {}).get(language, {}))
    write_json_to_file(messages, f"{locales_path}/{language}/messages.json")
  # Copy images
  print("Collecting images")
  images_path = f"{OUT_BUILD_PATH}/images"
  override_img_path = f"{config_path}/images"
  shutil.copytree("templates/images", images_path, dirs_exist_ok=True)
  if os.path.isdir(override_img_path):
    shutil.copytree(override_img_path, images_path, dirs_exist_ok=True)
  # Copying sources
  print("Assembling plugin sources")
  shutil.copytree("src/", OUT_BUILD_PATH, dirs_exist_ok=True)
  return f'{manifest["applications"]["gecko"]["id"]}-{manifest["version"]}'


def make_dev(config: str) -> None:
  """Performs a regular build, then watches the sources continuously for further changes
  and copies changed files over to the build directory."""
  make_build(config)
  subprocess.run(["watchmedo",
                  "shell-command",
                  "--patterns", "**/*.css;**/*.html;**/*.js;**/*.json",
                  "--recursive",
                  "--command", "SRC=${watch_src_path}; cp -v ${SRC} ./build/${SRC#./src/}",
                  "./src"])


def make_dist(name: str) -> None:
  """Packs all components into a distribution-ready plugin archive named <name>.xpi. Requires that make_config() was run before."""
  target = f"{OUT_DIST_PATH}/{name}.xpi"
  shutil.rmtree(OUT_DIST_PATH, ignore_errors=True)
  os.makedirs(OUT_DIST_PATH)
  with zipfile.ZipFile(target, "w") as zf:
    for path, _, files in os.walk(OUT_BUILD_PATH):
      for f in files:
         file_path = os.path.join(path, f)
         zf.write(file_path, file_path.removeprefix(OUT_BUILD_PATH))
  print(f"Plugin archive written to {target}")


def cleanup() -> None:
  """Removes ALL build artifacts from the file system."""
  for d in [OUT_BUILD_PATH, OUT_DIST_PATH]:
    if os.path.isdir(d):
      print(f"Removing directory {d}")
      shutil.rmtree(d)


args = parse_args()
if args.cmd == "build":
  plugin_id = make_build(args.config)
  if args.dist:
    make_dist(plugin_id)
elif args.cmd == "dev":
  make_dev(args.config)
elif args.cmd == "clean":
  cleanup()