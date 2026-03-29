QJSC = /usr/local/bin/qjsc
CC = gcc
CFLAGS = -g -O0 -Wall -fPIC -I/usr/local/include/quickjs
LDFLAGS = -L/usr/local/lib/quickjs -lquickjs -lm -lpthread -ldl

# socket
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
