# The game is plain ES modules with no build step, so the image is just a static
# file server. nginx is used over a Node server because correct MIME types for
# .js modules matter here: a module served as text/plain is refused by the browser
# and the whole game silently fails to boot.
FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html
COPY index.html ./
# The social preview image. Anything NOT copied here is not 404 — nginx's
# `try_files ... /index.html` hands it index.html with a 200, so a missing asset
# looks like a working one until you check the content type. og.png did exactly
# that: 200, text/html, and no preview on a shared link.
COPY og.png ./
COPY src ./src

EXPOSE 8080
