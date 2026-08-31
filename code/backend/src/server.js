const express=require("express");
const cors=require("cors");
require("dotenv").config();
const app=express();
app.use(express.json());
app.use(cors());

app.get("/",(req,res)=>{
    res.json({
        message:"Resolvex Backend is running"
    });
});
const authRoutes=require("./modules/auth/auth.routes");
app.use("/api/auth",authRoutes);
const PORT=process.env.port || 5000;
app.listen(PORT,()=>{
    console.log(`resolvex server runnning on port ${PORT}`);
});