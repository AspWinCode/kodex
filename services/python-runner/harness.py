#!/usr/bin/env python3
"""
Codex Python Runner — harness исполнения решения агента.

Запускается ВНУТРИ изолированного Docker-контейнера (см. Dockerfile) —
сам по себе harness не является границей безопасности: изоляция обеспечена
контейнером (--network=none, --read-only, --pids-limit, non-root, --rm),
а не попыткой ограничить Python на уровне языка (в общем случае это
ненадёжно — sandboxing самого интерпретатора Python легко обойти).

Протокол: один JSON-объект на stdin, один JSON-объект на stdout.

Вход:
  {
    "code": "def decode(s):\n    ...",
    "fnName": "decode",
    "evidence": [
      {"id": "e1", "tests": [{"args": [...], "expect": ...}, ...]},
      ...
    ]
  }

Выход (успешная компиляция):
  {
    "compileError": null,
    "results": [
      {"evidenceId": "e1", "pass": true},
      {"evidenceId": "e2", "pass": false, "crashed": true, "test": {...}, "error": "..."},
      {"evidenceId": "e3", "pass": false, "crashed": false, "test": {...}, "got": ...},
      ...
    ]
  }

Выход (код не скомпилировался / функция не найдена / таймаут):
  {"compileError": "человекочитаемое сообщение"}
"""

import sys
import json
import math
import signal

TIMEOUT_SECONDS = 8


class HarnessTimeout(Exception):
    pass


def _on_alarm(signum, frame):
    raise HarnessTimeout()


def normalize(value):
    """
    Приводит numpy/pandas объекты к обычным JSON-совместимым структурам,
    чтобы их можно было сравнить с expect, заданным Studio как plain JSON.
    numpy.ndarray и pandas.Series имеют .tolist() — этого достаточно для
    большинства учебных задач. pandas.DataFrame сравнивается как список
    записей (по одной на строку) — это самый читаемый вид для методиста,
    придумывающего expect в Studio.
    """
    if hasattr(value, 'columns') and hasattr(value, 'to_dict'):
        # похоже на pandas.DataFrame
        try:
            return value.to_dict(orient='records')
        except Exception:
            pass
    if hasattr(value, 'tolist'):
        try:
            return value.tolist()
        except Exception:
            pass
    if hasattr(value, 'to_dict'):
        try:
            return value.to_dict()
        except Exception:
            pass
    return value


def close_enough(a, b):
    """Толерантное сравнение (numpy/pandas часто дают 3.0000000000000004
    вместо 3.0 из-за особенностей floating point) — не полагаемся на ==."""
    if isinstance(a, bool) or isinstance(b, bool):
        return a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        try:
            return math.isclose(float(a), float(b), rel_tol=1e-6, abs_tol=1e-9)
        except (TypeError, ValueError):
            return a == b
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(close_enough(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return set(a.keys()) == set(b.keys()) and all(close_enough(a[k], b[k]) for k in a)
    return a == b


def fmt_error(e):
    return f'{type(e).__name__}: {e}'


def main():
    # Явно фиксируем UTF-8 независимо от локали окружения — на Windows
    # (локальная разработка без Docker) кодировка консоли по умолчанию
    # часто не UTF-8 (напр. cp1251), что ломает кириллицу в данных дела.
    # Внутри Linux-контейнера продакшна это no-op (там и так UTF-8).
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')

    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except Exception as e:
        print(json.dumps({'compileError': f'Не удалось разобрать входные данные: {e}'}))
        return

    code = payload.get('code', '')
    fn_name = payload.get('fnName', '')
    evidence = payload.get('evidence', [])

    # SIGALRM недоступен на Windows — там полагаемся только на внешний таймаут
    # (Node/Docker-обвязка); внутри Linux-контейнера продакшна SIGALRM есть всегда.
    has_alarm = hasattr(signal, 'SIGALRM')

    def cancel_alarm():
        if has_alarm:
            signal.alarm(0)

    if has_alarm:
        signal.signal(signal.SIGALRM, _on_alarm)
        signal.alarm(TIMEOUT_SECONDS)

    namespace = {}
    try:
        exec(code, namespace)
    except HarnessTimeout:
        print(json.dumps({'compileError': 'Превышено время выполнения — решение зациклилось или слишком медленное'}))
        return
    except Exception as e:
        cancel_alarm()
        print(json.dumps({'compileError': fmt_error(e)}))
        return

    fn = namespace.get(fn_name)
    if not callable(fn):
        cancel_alarm()
        print(json.dumps({'compileError': f'Функция «{fn_name}» не найдена в решении'}))
        return

    results = []
    try:
        for ev in evidence:
            ev_result = {'evidenceId': ev['id'], 'pass': True}
            for t in ev.get('tests', []):
                try:
                    got = fn(*t['args'])
                except HarnessTimeout:
                    raise
                except Exception as e:
                    ev_result = {'evidenceId': ev['id'], 'pass': False, 'crashed': True, 'test': t, 'error': fmt_error(e)}
                    break
                got_norm = normalize(got)
                if not close_enough(got_norm, t['expect']):
                    ev_result = {'evidenceId': ev['id'], 'pass': False, 'crashed': False, 'test': t, 'got': got_norm}
                    break
            results.append(ev_result)
    except HarnessTimeout:
        print(json.dumps({'compileError': 'Превышено время выполнения — решение зациклилось или слишком медленное'}))
        return
    finally:
        cancel_alarm()

    print(json.dumps({'compileError': None, 'results': results}))


if __name__ == '__main__':
    main()
