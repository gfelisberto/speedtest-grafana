FROM debian:11-slim AS get-speedtest

RUN apt-get update && apt-get install gnupg1 apt-transport-https dirmngr lsb-release -y
RUN apt-get install curl -y
RUN curl -s https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | bash
RUN apt-get install speedtest

FROM alpine:3.12 as install-dependencies
RUN apk add --no-cache npm
WORKDIR /build
COPY . .
RUN npm ci

FROM alpine:3.12 as prod-stage
RUN apk add --no-cache nodejs
LABEL maintainer="Jonas Friedmann <j@frd.mn>"

WORKDIR /usr/src/app

CMD [ "node", "index.js" ]

COPY --from=get-speedtest /usr/bin/speedtest /usr/bin/speedtest
COPY --from=install-dependencies /build .
