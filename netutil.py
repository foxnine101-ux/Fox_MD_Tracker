"""ネット通信の共通部品。

Windows の「信頼する証明書」は、使ううちに少しずつ増える仕組みなので、あまりネットを使っていない PC では
GitHub・Cloudflare などの証明書が入っておらず、「CERTIFICATE_VERIFY_FAILED: unable to get local issuer certificate」で
つながらないことがある。そこで、Windows の証明書に加えて、同梱した certifi の証明書も信頼する。
"""
import ssl

try:
    import certifi
except Exception:        # 無くても、Windows の証明書だけで動く
    certifi = None


def _make_ctx():
    ctx = ssl.create_default_context()           # Windows の証明書
    if certifi is not None:
        try:
            ctx.load_verify_locations(cafile=certifi.where())      # + 同梱の証明書
        except Exception:
            pass
    return ctx


CTX = _make_ctx()
