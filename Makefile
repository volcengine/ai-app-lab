.PHONY: all format lint test

# Default target executed when no arguments are given to make.
all: help

UV_VERSION=0.6.5
# uv command will be installed in ``${HOME}/.local/bin/`` directory.
PATH = ${HOME}/.local/bin/:$(shell printenv PATH)
uv_install:
		@if ! command -v uv >/dev/null; then \
		        echo "Install uv"; \
		        pip install uv==$(UV_VERSION); \
		else \
		        echo "Uv has been installed"; \
		fi

		@echo "Uv version: $(shell uv --version)"

install:
		export UV_SYSTEM_PYTHON=1
		uv sync

install_ci:
		export UV_SYSTEM_PYTHON=1
		uv sync --group lint --group typing --group test

build:
		uv build

clean:
		rm -rf dist

# Define a variable for the test file path.
TEST_FILE ?= tests/ut/

test:
		uv run pytest $(TEST_FILE)

######################
# LINTING AND FORMATTING
######################

# Define a variable for Python and notebook files.
PYTHON_FILES=.
MYPY_CACHE=.mypy_cache
format: PYTHON_FILES=./arkitect
lint: PYTHON_FILES=./arkitect
lint_diff format_diff: PYTHON_FILES=$(shell git diff --relative=arkitect/ --name-only --diff-filter=d master | grep -E '\.py$$|\.ipynb$$')
lint_package: PYTHON_FILES=arkitect
lint_tests: PYTHON_FILES=tests
lint_tests: MYPY_CACHE=.mypy_cache_test

lint lint_diff lint_package lint_tests:
		[ "$(PYTHON_FILES)" = "" ] || uv run ruff check --fix $(PYTHON_FILES)
		[ "$(PYTHON_FILES)" = "" ] || uv run ruff format $(PYTHON_FILES) --diff
		[ "$(PYTHON_FILES)" = "" ] || uv run ruff check --select I $(PYTHON_FILES)
		[ "$(PYTHON_FILES)" = "" ] || uv run mypy $(PYTHON_FILES) --install-types --non-interactive
		[ "$(PYTHON_FILES)" = "" ] || uv run mypy $(PYTHON_FILES)

format format_diff:
		uv run ruff format $(PYTHON_FILES)
		uv run ruff check --select I --fix $(PYTHON_FILES)

spell_check:
		uv run codespell --toml pyproject.toml

spell_fix:
		uv run codespell --toml pyproject.toml -w