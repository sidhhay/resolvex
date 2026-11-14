require("dotenv").config();
console.log("JWT_SECRET exists:", !!process.env.JWT_SECRET);
const express=require("express");
const cors=require("cors");
const app=express();
app.use(express.json());
app.use(cors());
const authenticate=require("./middleware/auth.middleware");
const authorize=require("./middleware/role.middleware");
app.get("/",(req,res)=>{
    res.json({
        message:"Resolvex Backend is running"
    });
});
const authRoutes=require("./modules/auth/auth.routes");
app.use("/api/auth",authRoutes);
app.get("/api/admin-test",authenticate,authorize("ADMIN"),(req,res)=>{
    res.json({
        message:"Welcom",
        user:req.user
    });
});
const PORT=process.env.PORT || 5000;
app.listen(PORT,()=>{
    console.log(`resolvex server runnning on port ${PORT}`);
});