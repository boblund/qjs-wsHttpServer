QJSC = /usr/local/bin/qjsc
CC = gcc
CFLAGS = -g -O0 -Wall -fPIC -I/usr/local/include/quickjs
LDFLAGS = -L/usr/local/lib/quickjs -lquickjs -lm -lpthread -ldl

# Compare lates
# a="2026-03-27T20:51:01Z" curl -s "https://api.github.com/repos/boblund/qjs-socket/commits?path=socket.c&per_page=1" | jq '.[0].commit.author.date'
# b="Mar 29 16:39" ls -l socket.c|tr -s ' '|cut -d ' ' -f 6-8
#
# t1=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$a" +%s)
# t2=$(date -j -f "%b %d %H:%M" "$b" +%s)
#
# (( t2 > t1 )) && echo later || echo earlier

all: wsHttpServer

# socket
socket.c:
	if [ ! -f socket.c ]; then \
		curl -L -o socket.c https://raw.githubusercontent.com/boblund/qjs-socket/main/socket.c; \
	fi

net.mjs:
	if [ ! -f net.mjs ]; then \
		curl -L -o net.mjs https://raw.githubusercontent.com/boblund/qjs-socket/main/net.mjs; \
	fi

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
	rm -f *.o wsHttpServer.c bundleFiles httpPaths.mjs wsHttpServer
