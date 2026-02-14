# NOVA Mining Safety Monitor - Makefile

BINARY_NAME=nova_monitor
GO_FILES=$(shell find . -name '*.go')

all: build

build:
	@echo "Building NOVA Monitor..."
	go build -o $(BINARY_NAME) main.go
	@echo "Build complete: $(BINARY_NAME)"

run: build
	@echo "Starting NOVA Monitor..."
	./$(BINARY_NAME)

clean:
	@echo "Cleaning up..."
	go clean
	rm -f $(BINARY_NAME)
	rm -f $(BINARY_NAME).exe
	rm -rf logs/*.csv
	@echo "Clean complete."

deps:
	@echo "Downloading dependencies..."
	go mod download
	@echo "Dependencies downloaded."

.PHONY: all build run clean deps
