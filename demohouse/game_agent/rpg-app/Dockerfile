FROM node:18 as build
WORKDIR /build
ADD . /build
RUN npm i
ENV NODE_ENV=production
RUN npm run build

FROM node:18-alpine
WORKDIR /game
COPY --from=build /build/dist ./dist
COPY --from=build /build/package*.json ./
ENV NODE_ENV=production
RUN npm i
EXPOSE 3000
CMD npm start