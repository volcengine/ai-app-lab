.PHONY: all format lint test

# Default target executed when no arguments are given to make.
all: help

POETRY_VERSION=1.6.1
# poetry command will be installed in ``${HOME}/.local/bin/`` directory.
PATH = ${HOME}/.local/bin/:$(shell printenv PATH)
poetry_install:
		@if ! command -v poetry >/dev/null; then \
		        echo "Install Poetry"; \
		        pip install poetry==$(POETRY_VERSION); \
		else \
		        echo "Poetry has been installed"; \
		fi

		@echo "Poetry version: $(shell poetry --version)"

install:
		poetry install

install_ci:
		poetry install --with lint,typing,test

build:
		poetry build

clean:
		rm -rf dist

# Define a variable for the test file path.
TEST_FILE ?= tests/ut/

test:
		poetry run pytest $(TEST_FILE)

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
		[ "$(PYTHON_FILES)" = "" ] || poetry run ruff $(PYTHON_FILES) --fix
		[ "$(PYTHON_FILES)" = "" ] || poetry run ruff format $(PYTHON_FILES) --diff
		[ "$(PYTHON_FILES)" = "" ] || poetry run ruff --select I $(PYTHON_FILES)
		[ "$(PYTHON_FILES)" = "" ] || poetry run mypy $(PYTHON_FILES) --install-types --non-interactive
		[ "$(PYTHON_FILES)" = "" ] || poetry run mypy $(PYTHON_FILES)

format format_diff:
		poetry run ruff format $(PYTHON_FILES)
		poetry run ruff --select I --fix $(PYTHON_FILES)

spell_check:
		poetry run codespell --toml pyproject.toml

spell_fix:
		poetry run codespell --toml pyproject.toml -w