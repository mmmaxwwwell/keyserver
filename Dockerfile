FROM node:lts-alpine
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
COPY --chown=node:node ./locales /home/node/app/locales
COPY --chown=node:node ./src /home/node/app/src
COPY --chown=node:node ./index.js /home/node/app
COPY --chown=node:node ./package-lock.json /home/node/app
COPY --chown=node:node ./package.json/ /home/node/app
WORKDIR /home/node/app
USER node
RUN npm ci --production
ENTRYPOINT [ "node", "index.js"] 