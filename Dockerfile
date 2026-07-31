# The game is plain ES modules with no build step, so the image is just a static
# file server. nginx is used over a Node server because correct MIME types for
# .js modules matter here: a module served as text/plain is refused by the browser
# and the whole game silently fails to boot.
FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html
COPY index.html ./
COPY src ./src

EXPOSE 8080
