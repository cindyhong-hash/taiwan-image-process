const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = 4321;

http
  .createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const file = path.join(root, p);
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(file);
    const type =
      ext === ".html" ? "text/html" : ext === ".js" ? "text/javascript" : "text/plain";
    res.writeHead(200, { "Content-Type": type + "; charset=utf-8" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log("wireframes on http://localhost:" + port));
