"""Reusable lossless plate + small-gallery derivative policy; no host paths."""
import io
from PIL import Image, ImageOps

def encode_plate(payload: bytes, profile: dict | None = None) -> dict:
    original=Image.open(io.BytesIO(payload)).convert('RGB')
    source_dimensions=list(original.size)
    crop=None
    if profile is not None:
        width,height=profile['width'],profile['height']
        if width<=0 or height<=0 or original.width<width or original.height<height:
            raise ValueError('Uniform plate output must fit the native source; enlargement is prohibited')
        from math import gcd
        divisor=gcd(width,height);rw,rh=width//divisor,height//divisor
        scale=min(original.width//rw,original.height//rh);cw,ch=rw*scale,rh*scale
        left=(original.width-cw)//2;top=(original.height-ch)//2
        crop=[left,top,cw,ch]
        original=original.crop((left,top,left+cw,top+ch)).resize((width,height),Image.Resampling.LANCZOS)
        if profile.get('grayscale'):original=ImageOps.grayscale(original).convert('RGB')
    output=io.BytesIO();original.save(output,format='WEBP',lossless=True,method=4,icc_profile=original.info.get('icc_profile',b''))
    lossless=output.getvalue();decoded=Image.open(io.BytesIO(lossless)).convert('RGB')
    if decoded.size!=original.size or decoded.tobytes()!=original.tobytes():raise ValueError('Plate derivative changed source pixels')
    image=original.copy();image.thumbnail((profile.get("thumbnail_width",320),profile.get("thumbnail_height",180)) if profile else (320,180),Image.Resampling.LANCZOS)
    output=io.BytesIO();image.save(output,format='WEBP',quality=82,method=6)
    return {'lossless':lossless,'thumbnail':output.getvalue(),'dimensions':list(original.size),'thumbnail_dimensions':list(image.size),'source_dimensions':source_dimensions,'crop':crop,'normalized_grayscale':bool(profile and profile.get('grayscale'))}
