# Codex Python Runner — образ для изолированного исполнения решений агента.
#
# Изоляция обеспечивается НЕ этим образом самим по себе, а тем, как его
# запускают (services/content-api/runner/python-runner.mjs):
#   --network=none --read-only --tmpfs /tmp --memory=256m --cpus=0.5
#   --pids-limit=64 --rm, без bind-mount'ов на хост.
# Non-root пользователь здесь — вторая линия защиты (defense in depth),
# а не единственная.

FROM python:3.11-slim

# Версии зафиксированы явно — воспроизводимость сборки образа важнее,
# чем автоматическое обновление минорных версий numpy/pandas.
RUN pip install --no-cache-dir numpy==1.26.4 pandas==2.2.2 \
    && useradd -m -u 1000 runner

WORKDIR /harness
COPY harness.py /harness/harness.py

USER runner

ENTRYPOINT ["python3", "-u", "/harness/harness.py"]
