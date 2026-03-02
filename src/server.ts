import { setDefaultResultOrder } from "dns";
setDefaultResultOrder("ipv4first")

import app from "./app";
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
})