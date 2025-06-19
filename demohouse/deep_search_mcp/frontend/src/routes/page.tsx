import { Helmet } from '@modern-js/runtime/head';
import './index.css';
import MCP from '@/demo/mcp';

const Index = () => (
  <div>
    <Helmet>
      <link
        rel="icon"
        type="image/x-icon"
        href="https://lf3-static.bytednsdoc.com/obj/eden-cn/uhbfnupenuhf/favicon.ico"
      />
    </Helmet>
    <main>
      <div className="h-screen">
        <MCP url="http://0.0.0.0:8888/api/v3/bots/chat/completions" />
      </div>
    </main>
  </div>
);

export default Index;
