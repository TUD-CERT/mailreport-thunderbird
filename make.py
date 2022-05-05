#!/usr/bin/env python3
"""
Plugin poject build script

Used to build the plugin for development or to produce a 
distribution-ready xpi archive. Can also clean up after itself.
"""

import argparse
import collections.abc
import json
import os
import shutil
import sys
from typing import Dict
import zipfile

DEFAULTS_TPL = 'templates/defaults.tpl'
LOCALES_TPL = 'templates/locales'
MANIFEST_TPL = 'templates/manifest.tpl'
OUT_DEFAULTS_PATH = 'defaults.json'
OUT_DIST_PATH = 'dist'
OUT_IMAGES_PATH = 'images'
OUT_LOCALES_PATH = '_locales'
OUT_MANIFEST_PATH = 'manifest.json'


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser()
  subparsers = parser.add_subparsers(dest='cmd', required=True, title='subcommands')
  parser_build = subparsers.add_parser('build', aliases=['b'], help='Builds the plugin')
  parser_build.add_argument('config', help='Deployment configuration to use during build')
  parser_build.add_argument('-d', '--dist', action='store_true', help='Creates a distribution-ready plugin archive in dist/')
  parser_build.set_defaults(cmd='build')
  parser_clean = subparsers.add_parser('clean', aliases=['c'], help='Cleans up all build artifacts')
  parser_clean.set_defaults(cmd='clean')
  return parser.parse_args()


def quit(msg: str) -> None:
  """Shortcut to quit from anywhere and display an error message."""
  print(f'Error: {msg}')
  sys.exit(1)


def parse_json_from_file(path: str) -> Dict:
  """Attemps to parse JSON from path, returns the result."""
  with open(path, 'r') as f:
    try:
      result = json.load(f)
    except json.decoder.JSONDecodeError:
      quit(f'Invalid JSON document: {path}')
  return result


def write_json_to_file(data: Dict, path: str) -> None:
  """Convertes data to JSON and writes it to path."""
  print(f'Writing {path}')
  with open(path, 'w') as f:
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
  action = 'browser_action' if config['use_toolbar_button'] else 'message_display_action'
  manifest[action] = manifest.pop('action')
  return manifest


def make_config(config: str) -> str:
  """Parses the given deployment configuration (a directory) to create all required plugin components.
  Returns a plugin id according to the generated manifest."""
  config_path = f'configs/{config}'
  if not os.path.isdir(config_path):
    quit(f'The deployment configuration directory ({config_path}) does not exist')
  overrides = parse_json_from_file(f'{config_path}/overrides.json')
  defaults_tpl = parse_json_from_file(DEFAULTS_TPL)
  manifest_tpl = parse_json_from_file(MANIFEST_TPL)
  # Combine template with overrides to create manifest.json and defaults.json
  defaults = update_template(defaults_tpl, overrides.get('defaults', {}))
  manifest = create_manifest(manifest_tpl, overrides.get('manifest', {}), defaults)
  write_json_to_file(defaults, OUT_DEFAULTS_PATH)
  write_json_to_file(manifest, OUT_MANIFEST_PATH)
  # Combine l18n templates and overrides to create locales
  shutil.rmtree(OUT_LOCALES_PATH, ignore_errors=True)
  for language in os.listdir(LOCALES_TPL):
    os.makedirs(f'{OUT_LOCALES_PATH}/{language}')
    messages_tpl = parse_json_from_file(f'{LOCALES_TPL}/{language}/messages.json')
    messages = update_template(messages_tpl, overrides.get('locales', {}).get(language, {}))
    write_json_to_file(messages, f'{OUT_LOCALES_PATH}/{language}/messages.json')
  # Copy images
  override_img_path = f'{config_path}/images'
  template_img_path = 'templates/images'
  print('Creating images/')
  shutil.rmtree(OUT_IMAGES_PATH, ignore_errors=True)
  shutil.copytree(template_img_path, OUT_IMAGES_PATH)
  if os.path.isdir(override_img_path):
    shutil.copytree(override_img_path, OUT_IMAGES_PATH, dirs_exist_ok=True)
  return f'{manifest["applications"]["gecko"]["id"]}-{manifest["version"]}'


def make_dist(name: str) -> None:
  """Packs all components into a distribution-ready plugin archive named <name>.xpi. Requires that make_config() was run before."""
  target = f'{OUT_DIST_PATH}/{name}.xpi'
  shutil.rmtree(OUT_DIST_PATH, ignore_errors=True)
  os.makedirs(OUT_DIST_PATH)
  with zipfile.ZipFile(target, 'w') as zf:
    for f in ['background.html', 'background.js', 'defaults.json', 'implementation.js', 'manifest.json', 'schema.json', 'settings.js', 'styles.css']:
      zf.write(f)
    for d in ['images', '_locales', 'options', 'report', 'update', 'vendor']:
      for path, _, files in os.walk(d):
        for f in files:
          zf.write(os.path.join(path, f))
  print(f'Plugin archive written to {target}')


def cleanup() -> None:
  """Removes ALL build artifacts from the file system, including the dist directory."""
  for f in ['defaults.json', 'manifest.json']:
    if os.path.isfile(f):
      print(f'Removing file {f}')
      os.remove(f)
  for d in ['_locales', 'images', 'dist']:
    if os.path.isdir(d):
      print(f'Removing directory {d}')
      shutil.rmtree(d)


args = parse_args()
if args.cmd == 'build':
  plugin_id = make_config(args.config)
  if args.dist:
    make_dist(plugin_id)
elif args.cmd == 'clean':
  cleanup()

