QJSC = /usr/local/bin/qjsc
CC = gcc
CFLAGS = -O2 -Wall -fPIC -I/usr/local/include/quickjs -I/opt/homebrew/opt/openssl/include
LDFLAGS = -L/usr/local/lib/quickjs -lquickjs -L/opt/homebrew/opt/openssl/lib -lssl -lcrypto -lm -lpthread -ldl

all: wsHttpServer

OS := $(shell uname -s)
JQ := $(shell which jq)

ifeq ($(OS), Linux)
DATE_EPOCH = date -u -d "$$r" +%s
DATE_TOUCH = date -d "@$$r_epoch" '+%Y%m%d%H%M.%S'
else ifeq ($(OS), Darwin)
DATE_EPOCH = date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$$r" +%s
DATE_TOUCH = date -j -r "$$r_epoch" '+%Y%m%d%H%M.%S'
endif

all: wsHttpServer

#ifdef DATE_EPOCH
ifneq ($(and $(DATE_EPOCH),$(JQ)),)
socket.c net.mjs:
	@r=`curl -s "https://api.github.com/repos/boblund/qjs-socket/commits?path=$@&per_page=1" | jq -r '.[0].commit.author.date'`; \
	r_epoch=`$(DATE_EPOCH)`; \
	r_touch=`$(DATE_TOUCH)`; \
	l_epoch=`[ -f $@ ] && date -r $@ +%s || echo 0`; \
	if [ "$$l_epoch" -lt "$$r_epoch" ]; then \
		curl -L -o $@ https://raw.githubusercontent.com/boblund/qjs-socket/main/$@; \
		touch -t $$r_touch $@; \
	else echo "$@ is up to date."; fi
else
$(warning "OS not Linux or Darwin or jq not installed. socket.c and net.mjs not updated")
endif

socket.o: socket.c
	$(CC) $(CFLAGS) -c socket.c -o socket.o

socket.so: socket.c
	$(CC) -fPIC -shared -DJS_SHARED_LIBRARY -o socket.so socket.c \
	    -I/usr/local/include/quickjs -L/usr/local/lib/quickjs \
	    -lquickjs -lm -lpthread -ldl

bundleFiles: bundleFiles.mjs abConversions.mjs
	$(QJSC) -o bundleFiles bundleFiles.mjs abConversions.mjs

HTTP_PATHS_FILES := $(shell find files -type f) #$(wildcard files/*)
print-http:
	@echo $(HTTP_PATHS_FILES)

httpPaths.mjs: $(HTTP_PATHS_FILES) bundleFiles
	./bundleFiles $(HTTP_PATHS_FILES)

# wsHttpServer
wsHttpServer.c: wsHttpServer.js httpPaths.mjs abConversions.mjs http.mjs ws.mjs sha1.mjs net.mjs
	$(QJSC) -e -M socket.so,socket -o wsHttpServer.c wsHttpServer.js httpPaths.mjs abConversions.mjs  http.mjs ws.mjs sha1.mjs net.mjs

wsHttpServer.o: wsHttpServer.c
	$(CC) $(CFLAGS) -c wsHttpServer.c -o wsHttpServer.o

wsHttpServer: wsHttpServer.o socket.o
	$(CC) $(LDFLAGS) -o wsHttpServer wsHttpServer.o socket.o

.PHONY: clean

clean:
	rm -f *.o socket.c net.mjs wsHttpServer.c bundleFiles httpPaths.mjs wsHttpServer
