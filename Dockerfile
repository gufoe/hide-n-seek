FROM node:20-alpine
COPY . .
RUN cd server && yarn
RUN cd ui && yarn && yarn build
EXPOSE 4173
EXPOSE 54321
ENTRYPOINT [ "bash", "-c", "(cd server && yarn start) &; (cd ui && yarn preview) &; wait" ]