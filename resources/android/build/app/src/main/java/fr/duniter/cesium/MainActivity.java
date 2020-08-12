/*
       Licensed to the Apache Software Foundation (ASF) under one
       or more contributor license agreements.  See the NOTICE file
       distributed with this work for additional information
       regarding copyright ownership.  The ASF licenses this file
       to you under the Apache License, Version 2.0 (the
       "License"); you may not use this file except in compliance
       with the License.  You may obtain a copy of the License at

         http://www.apache.org/licenses/LICENSE-2.0

       Unless required by applicable law or agreed to in writing,
       software distributed under the License is distributed on an
       "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
       KIND, either express or implied.  See the License for the
       specific language governing permissions and limitations
       under the License.
 */

package fr.duniter.cesium;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import org.apache.cordova.*;

import java.io.IOException;
import java.io.StringWriter;
import java.io.Writer;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;

import java.net.URLEncoder;
import java.util.Locale;

public class MainActivity extends CordovaActivity
{
    @Override
    public void onCreate(Bundle savedInstanceState)
    {
        super.onCreate(savedInstanceState);

        // enable Cordova apps to be started in the background
        Bundle extras = getIntent().getExtras();
        if (extras != null && extras.getBoolean("cdvStartInBackground", false)) {
            moveTaskToBack(true);
        }

        // Set by <content src="index.html" /> in config.xml
        loadUrl(launchUrl);
    }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);

    String action = intent.getAction();
    if ("android.intent.action.VIEW".equals(action)) {
      Uri data = intent.getData();
      loadFromUri(data);
      setResult(Activity.RESULT_OK);
    }
  }

  protected void loadFromUri(Uri uri) {
    List<String> pathSegments;
    final String scheme = uri.getScheme();
    if (scheme == null) return; // Skip if no scheme

    if ("http".equals(scheme) || "https".equals(scheme)) {
      pathSegments = uri.getPathSegments();
    } else if ("web+june".equals(scheme) || "june".equals(scheme)) {
      pathSegments = new ArrayList<String>();
      // Use the host as first path segment
      pathSegments.add(uri.getHost());
      if (uri.getPathSegments() != null) pathSegments.addAll(uri.getPathSegments());
    } else {
      return; // Skip
    }

    if (pathSegments.size() == 0) return; // Skip

    // Create the URI expected by Cesium
    String fixedUri = "june://" + join(pathSegments, "/");
    if (uri.getQuery() != null) {
      fixedUri += uri.getQuery();
    }
    String url = getLaunchUrlNoHash() + "#/app/home?uri=" + URLEncoder.encode(fixedUri);

    if (appView == null) {
      init();
    }
    this.appView.loadUrlIntoView(url, false);
  }

  protected String getLaunchUrlNoHash() {
    String url = this.launchUrl;
    // Remove hash path
    int hashIndex = url.indexOf('#');
    if (hashIndex != -1) {
      url = url.substring(0, hashIndex);
    }
    return url;
  }


  protected String join(List<String> items, String separator) {
      StringBuilder sb = new StringBuilder();
      for (int i = 0; i<items.size(); i++) {
        sb.append(items.get(i));
        sb.append(separator);
      }
      // Remove last separator
      sb.setLength(sb.length() - separator.length());

      return sb.toString();
  }

  // Taken from commons StringEscapeUtils
  protected void escapeJavaStyleString(Writer out, String str, boolean escapeSingleQuote,
                                       boolean escapeForwardSlash) throws IOException {
    if (out == null) {
      throw new IllegalArgumentException("The Writer must not be null");
    }
    if (str == null) {
      return;
    }
    int sz;
    sz = str.length();
    for (int i = 0; i < sz; i++) {
      char ch = str.charAt(i);

      // handle unicode
      if (ch > 0xfff) {
        out.write("\\u" + hex(ch));
      } else if (ch > 0xff) {
        out.write("\\u0" + hex(ch));
      } else if (ch > 0x7f) {
        out.write("\\u00" + hex(ch));
      } else if (ch < 32) {
        switch (ch) {
          case '\b':
            out.write('\\');
            out.write('b');
            break;
          case '\n':
            out.write('\\');
            out.write('n');
            break;
          case '\t':
            out.write('\\');
            out.write('t');
            break;
          case '\f':
            out.write('\\');
            out.write('f');
            break;
          case '\r':
            out.write('\\');
            out.write('r');
            break;
          default:
            if (ch > 0xf) {
              out.write("\\u00" + hex(ch));
            } else {
              out.write("\\u000" + hex(ch));
            }
            break;
        }
      } else {
        switch (ch) {
          case '\'':
            if (escapeSingleQuote) {
              out.write('\\');
            }
            out.write('\'');
            break;
          case '"':
            out.write('\\');
            out.write('"');
            break;
          case '\\':
            out.write('\\');
            out.write('\\');
            break;
          case '/':
            if (escapeForwardSlash) {
              out.write('\\');
            }
            out.write('/');
            break;
          default:
            out.write(ch);
            break;
        }
      }
    }
  }

  private static String hex(char ch) {
    return Integer.toHexString(ch).toUpperCase(Locale.ENGLISH);
  }
}
