const jwt=require("jsonwebtoken");
const secret=process.env.JWT_SECRET||"dev_secret_change_me";
function sign(payload){return jwt.sign(payload,secret,{expiresIn:"7d"})}
function auth(req,res,next){try{const h=req.headers.authorization||"";if(!h.startsWith("Bearer "))throw Error();req.user=jwt.verify(h.slice(7),secret);next()}catch(e){res.status(401).json({error:"Authentication required"})}}
function adminOnly(req,res,next){if(req.user.role!=="admin")return res.status(403).json({error:"Admin access required"});next()}
module.exports={auth,adminOnly,sign};