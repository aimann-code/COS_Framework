package com.cos.shared.reg;

import java.util.*;

/** Dependency-free contract scenarios; JUnit invokes the same scenarios. Synthetic data only. */
public final class UniqueKeyRuleSmokeTest {
  private static int checks;
  private static void check(boolean ok) { checks++; if(!ok)throw new AssertionError("Scenario "+checks); }
  private static void invalid(Runnable action) {
    checks++;
    try { action.run(); } catch(IllegalArgumentException expected) { return; }
    throw new AssertionError("Expected invalid input in scenario "+checks);
  }
  private static UniqueKeyRule.Field f(String name,UniqueKeyRule.Normalization mode) {
    return new UniqueKeyRule.Field(name,mode);
  }
  public static void main(String[] args) {
    checks=0;
    var exact=UniqueKeyRule.Normalization.EXACT;
    var trim=UniqueKeyRule.Normalization.TRIM;
    var fold=UniqueKeyRule.Normalization.CASE_FOLD;
    invalid(()->new UniqueKeyRule(1,List.of(f("name",exact))));
    invalid(()->new UniqueKeyRule(1,List.of(f("name",exact),f("name",fold))));
    invalid(()->new UniqueKeyRule(0,List.of(f("name",exact),f("dob",exact))));
    invalid(()->new UniqueKeyRule(1,List.of(f("name",null),f("dob",exact))));
    invalid(()->new UniqueKeyRule(1,List.of(f("name;drop",exact),f("dob",exact))));
    var rule=new UniqueKeyRule(1,List.of(f("name",fold),f("dob",trim)));
    check(rule.missing(Map.of()).equals(List.of("name","dob")));
    check(rule.missing(Map.of("name","Synthetic")).equals(List.of("dob")));
    check(rule.missing(Map.of("name"," ", "dob","2000-01-01")).equals(List.of("name")));
    try { rule.canonical(Map.of("name","Synthetic")); throw new AssertionError(); }
    catch(UniqueKeyRule.MissingValues e) { check(e.fields().equals(List.of("dob"))); }
    check(rule.canonical(Map.of("name"," SYNTHETIC ","dob","2000-01-01 "))
        .equals(rule.canonical(Map.of("name","synthetic","dob","2000-01-01"))));
    var pair=new UniqueKeyRule(2,List.of(f("a",exact),f("b",exact)));
    check(!pair.canonical(Map.of("a","ab","b","c")).equals(pair.canonical(Map.of("a","a","b","bc"))));
    check(!pair.canonical(Map.of("a"," a","b","b")).equals(pair.canonical(Map.of("a","a","b","b"))));
    check(!pair.canonical(Map.of("a","A","b","b")).equals(pair.canonical(Map.of("a","a","b","b"))));
    check(pair.canonical(Map.of("a","e\u0301","b","b")).equals(pair.canonical(Map.of("a","é","b","b"))));
    var fields=new ArrayList<>(List.of(f("name",fold),f("dob",trim)));
    var frozen=new UniqueKeyRule(1,fields); fields.clear(); check(frozen.fields().size()==2);
    check(rule.fields().stream().map(UniqueKeyRule.Field::name).toList().equals(List.of("name","dob")));
    invalid(()->pair.canonical(Map.of("a",String.valueOf((char)0xD800),"b","b")));
    check(!pair.canonical(Map.of("a","x:1","b","y")).equals(pair.canonical(Map.of("a","x","b","1:y"))));
    System.out.println("PASS: "+checks+" composite-key contract scenarios");
  }
}
