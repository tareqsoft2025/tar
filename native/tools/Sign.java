import com.android.apksig.ApkSigner;
import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

public class Sign {
    public static void main(String[] a) throws Exception {
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream in = new FileInputStream(a[0])) { ks.load(in, "android".toCharArray()); }
        PrivateKey key = (PrivateKey) ks.getKey("prayer", "android".toCharArray());
        X509Certificate cert = (X509Certificate) ks.getCertificate("prayer");
        ApkSigner.SignerConfig cfg = new ApkSigner.SignerConfig.Builder("prayer", key, Collections.singletonList(cert)).build();
        new ApkSigner.Builder(Collections.singletonList(cfg))
            .setInputApk(new File(a[1])).setOutputApk(new File(a[2]))
            .setMinSdkVersion(24).setV1SigningEnabled(false).setV2SigningEnabled(true).build().sign();
    }
}
