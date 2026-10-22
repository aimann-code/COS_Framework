package com.cos.hrms.shared;

import com.cos.hrms.config.COSProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.text.Normalizer;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

@Component
public class COSCrypto {
  private final byte[] encryption_key, fingerprint_key;
  private final SecureRandom random = new SecureRandom();

  public COSCrypto(COSProperties properties) {
    try {
      encryption_key = Base64.getDecoder().decode(properties.getEncryptionKey());
      fingerprint_key = Base64.getDecoder().decode(properties.getFingerprintKey());
    } catch (Exception e) {
      throw new IllegalStateException(
          "Provide separate base64-encoded encryption and fingerprint keys.");
    }
    if (encryption_key.length != 32
        || fingerprint_key.length < 32
        || MessageDigest.isEqual(encryption_key, fingerprint_key))
      throw new IllegalStateException(
          "Encryption requires 32 bytes and a distinct fingerprint key of at least 32 bytes.");
  }

  public String encrypt(String value, String context) {
    try {
      byte[] nonce = new byte[12];
      random.nextBytes(nonce);
      var cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(
          Cipher.ENCRYPT_MODE,
          new SecretKeySpec(encryption_key, "AES"),
          new GCMParameterSpec(128, nonce));
      cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8));
      return "v1."
          + Base64.getEncoder().encodeToString(nonce)
          + "."
          + Base64.getEncoder()
              .encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException("Protected data could not be encrypted.");
    }
  }

  public String decrypt(String value, String context) {
    try {
      var parts = value.split("\\.");
      if (parts.length != 3 || !parts[0].equals("v1")) throw new IllegalArgumentException();
      var cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(
          Cipher.DECRYPT_MODE,
          new SecretKeySpec(encryption_key, "AES"),
          new GCMParameterSpec(128, Base64.getDecoder().decode(parts[1])));
      cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8));
      return new String(
          cipher.doFinal(Base64.getDecoder().decode(parts[2])), StandardCharsets.UTF_8);
    } catch (Exception e) {
      throw new IllegalStateException("Protected data could not be read.");
    }
  }

  public String fingerprint(String... parts) {
    try {
      var mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(fingerprint_key, "HmacSHA256"));
      for (String part : parts) {
        byte[] bytes =
            Normalizer.normalize(part.trim(), Normalizer.Form.NFC)
                .toLowerCase(Locale.ROOT)
                .getBytes(StandardCharsets.UTF_8);
        mac.update(java.nio.ByteBuffer.allocate(4).putInt(bytes.length).array());
        mac.update(bytes);
      }
      return HexFormat.of().formatHex(mac.doFinal());
    } catch (Exception e) {
      throw new IllegalStateException("Fingerprint calculation failed.");
    }
  }

  public String hash(String value) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public String keyedHash(String value) {
    try {
      var mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(fingerprint_key, "HmacSHA256"));
      return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public String mask(String value) {
    return value == null || value.isBlank()
        ? ""
        : value.length() <= 4 ? "••••" : "•••• " + value.substring(value.length() - 4);
  }
}
